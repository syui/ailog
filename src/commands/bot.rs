use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use super::auth;
use super::token;
use crate::lexicons::{app_bsky_notification, com_atproto_repo};
use crate::tid;
use crate::types::{PutRecordRequest, PutRecordResponse};
use crate::xrpc::XrpcClient;

const BOT_RULES: &str = include_str!("../rules/bot.md");

/// Persistent Claude session using stream-json protocol
struct ClaudeSession {
    stdin: tokio::process::ChildStdin,
    response_rx: tokio::sync::mpsc::Receiver<String>,
}

impl ClaudeSession {
    /// Spawn a persistent claude process with stream-json I/O
    async fn spawn() -> Result<Self> {
        // Run claude inside a dedicated directory under config
        let work_dir = dirs::config_dir()
            .context("Could not find config directory")?
            .join(token::BUNDLE_ID)
            .join("bot");
        fs::create_dir_all(&work_dir)?;

        // Always overwrite CLAUDE.md with latest rules
        let rules_path = work_dir.join("CLAUDE.md");
        fs::write(&rules_path, BOT_RULES)?;

        eprintln!("bot: claude working directory = {}", work_dir.display());

        let mut child = tokio::process::Command::new("claude")
            .arg("--input-format")
            .arg("stream-json")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--verbose")
            .arg("--dangerously-skip-permissions")
            .current_dir(&work_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("failed to start claude process")?;

        let stdin = child.stdin.take().context("failed to capture claude stdin")?;
        let stdout = child.stdout.take().context("failed to capture claude stdout")?;
        let stderr = child.stderr.take().context("failed to capture claude stderr")?;

        // Background task: log stderr
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("bot: claude stderr: {}", line);
            }
        });

        // Brief wait to check if the process exits immediately
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        let (tx, rx) = tokio::sync::mpsc::channel::<String>(16);

        // Background task: read stdout JSON lines and extract responses
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let mut accumulated = String::new();

            loop {
                let line = match lines.next_line().await {
                    Ok(Some(l)) => l,
                    Ok(None) => {
                        eprintln!("bot: claude stdout closed");
                        break;
                    }
                    Err(e) => {
                        eprintln!("bot: claude stdout error: {}", e);
                        break;
                    }
                };

                if line.trim().is_empty() {
                    continue;
                }

                let json: Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                let msg_type = json.get("type").and_then(|t| t.as_str());
                match msg_type {
                    Some("assistant") => {
                        // Extract text from content array
                        if let Some(content) = json.pointer("/message/content").and_then(|c| c.as_array()) {
                            for item in content {
                                if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                                    if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                        accumulated = text.to_string();
                                    }
                                }
                            }
                        }
                    }
                    Some("result") => {
                        // Use accumulated text if available, otherwise use result field
                        let response = if !accumulated.is_empty() {
                            std::mem::take(&mut accumulated)
                        } else {
                            json.get("result")
                                .and_then(|r| r.as_str())
                                .unwrap_or("")
                                .to_string()
                        };

                        if tx.send(response).await.is_err() {
                            break;
                        }
                        accumulated.clear();
                    }
                    _ => {}
                }
            }

            // Wait for child to exit
            let status = child.wait().await;
            eprintln!("bot: claude process exited: {:?}", status);
        });

        Ok(Self {
            stdin,
            response_rx: rx,
        })
    }

    /// Send a message and wait for the response (with 120s timeout)
    async fn send(&mut self, text: &str) -> Result<String> {
        let msg = serde_json::json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": text
            }
        });

        let mut line = serde_json::to_string(&msg)?;
        line.push('\n');
        self.stdin
            .write_all(line.as_bytes())
            .await
            .context("failed to write to claude stdin")?;
        self.stdin.flush().await?;

        // Wait for response (no timeout — claude may use tools)
        let response = self.response_rx.recv()
            .await
            .context("claude session closed unexpectedly")?;

        if response.is_empty() {
            anyhow::bail!("claude returned empty response");
        }

        // Truncate to 300 graphemes (Bluesky limit)
        let truncated: String = response.chars().take(300).collect();
        Ok(truncated)
    }
}

/// Persistent bot state: tracks processed notifications
#[derive(Debug, Default, Serialize, Deserialize)]
struct BotState {
    /// Set of processed notification URIs
    processed: HashSet<String>,
    /// Timestamp of the last seen notification
    #[serde(default)]
    last_seen: Option<String>,
}

/// Parsed notification for processing
struct Notification {
    uri: String,
    #[allow(dead_code)]
    cid: String,
    #[allow(dead_code)]
    author_did: String,
    author_handle: String,
    text: String,
    #[allow(dead_code)]
    indexed_at: String,
    root_uri: String,
    root_cid: String,
    parent_uri: String,
    parent_cid: String,
}

/// State file path: ~/.config/ai.syui.log/bot_state.json
fn state_path() -> Result<PathBuf> {
    let config_dir = dirs::config_dir()
        .context("Could not find config directory")?
        .join(token::BUNDLE_ID);
    fs::create_dir_all(&config_dir)?;
    Ok(config_dir.join("bot_state.json"))
}

fn load_state() -> BotState {
    let path = match state_path() {
        Ok(p) => p,
        Err(_) => return BotState::default(),
    };
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => BotState::default(),
    }
}

fn save_state(state: &BotState) -> Result<()> {
    let path = state_path()?;
    let content = serde_json::to_string_pretty(state)?;
    fs::write(&path, content)?;
    Ok(())
}

/// Load admin DID from config.json
fn load_admin_did(config_path: &str) -> Result<String> {
    let content = fs::read_to_string(config_path)
        .with_context(|| format!("Config file not found: {}", config_path))?;
    let config: Value = serde_json::from_str(&content)?;
    config["did"]
        .as_str()
        .map(|s| s.to_string())
        .context("config.json missing 'did' field")
}

/// Fetch notifications using the bot session
async fn fetch_notifications(
    client: &XrpcClient,
    token: &str,
) -> Result<Vec<Value>> {
    let body: Value = client
        .query_auth(
            &app_bsky_notification::LIST_NOTIFICATIONS,
            &[("limit", "50")],
            token,
        )
        .await?;

    Ok(body["notifications"]
        .as_array()
        .cloned()
        .unwrap_or_default())
}

/// Parse a notification JSON value into a Notification struct
fn parse_notification(notif: &Value) -> Option<Notification> {
    let uri = notif["uri"].as_str()?;
    let cid = notif["cid"].as_str()?;
    let author_did = notif["author"]["did"].as_str()?;
    let author_handle = notif["author"]["handle"].as_str().unwrap_or("unknown");
    let text = notif["record"]["text"].as_str().unwrap_or("");
    let indexed_at = notif["indexedAt"].as_str().unwrap_or("");

    // Determine root: use reply root if present, otherwise this post is root
    let root_uri = notif["record"]["reply"]["root"]["uri"]
        .as_str()
        .unwrap_or(uri);
    let root_cid = notif["record"]["reply"]["root"]["cid"]
        .as_str()
        .unwrap_or(cid);

    // Parent is always this notification's post
    Some(Notification {
        uri: uri.to_string(),
        cid: cid.to_string(),
        author_did: author_did.to_string(),
        author_handle: author_handle.to_string(),
        text: text.to_string(),
        indexed_at: indexed_at.to_string(),
        root_uri: root_uri.to_string(),
        root_cid: root_cid.to_string(),
        parent_uri: uri.to_string(),
        parent_cid: cid.to_string(),
    })
}

/// Post a reply using the bot session
async fn post_reply(
    client: &XrpcClient,
    session: &token::Session,
    text: &str,
    root_uri: &str,
    root_cid: &str,
    parent_uri: &str,
    parent_cid: &str,
) -> Result<PutRecordResponse> {
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();

    let record = serde_json::json!({
        "$type": "app.bsky.feed.post",
        "text": text,
        "reply": {
            "root": {
                "uri": root_uri,
                "cid": root_cid,
            },
            "parent": {
                "uri": parent_uri,
                "cid": parent_cid,
            },
        },
        "createdAt": now,
    });

    let rkey = tid::generate_tid();

    let req = PutRecordRequest {
        repo: session.did.clone(),
        collection: "app.bsky.feed.post".to_string(),
        rkey,
        record,
    };

    let result: PutRecordResponse = client
        .call(&com_atproto_repo::PUT_RECORD, &req, &session.access_jwt)
        .await?;

    Ok(result)
}

/// Main bot entry point
pub async fn start(interval_secs: u64, config_path: &str) -> Result<()> {
    let admin_did = load_admin_did(config_path)?;
    eprintln!("bot: admin DID = {}", admin_did);
    eprintln!("bot: polling interval = {}s", interval_secs);

    let mut state = load_state();

    // Spawn persistent Claude session
    let mut session = ClaudeSession::spawn().await?;
    eprintln!("bot: claude session started");
    eprintln!("bot: starting notification loop...");

    loop {
        if let Err(e) = poll_once(&admin_did, &mut state, &mut session).await {
            eprintln!("bot: poll error: {}", e);
        }
        tokio::time::sleep(std::time::Duration::from_secs(interval_secs)).await;
    }
}

/// Single poll iteration
async fn poll_once(
    admin_did: &str,
    state: &mut BotState,
    claude: &mut ClaudeSession,
) -> Result<()> {
    // Refresh bot session
    let session = auth::refresh_bot_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let client = XrpcClient::new(pds);

    // Fetch notifications
    let notifications = fetch_notifications(&client, &session.access_jwt).await?;

    let mut new_items: Vec<Notification> = Vec::new();

    for notif in &notifications {
        let reason = notif["reason"].as_str().unwrap_or("");

        // Only process mentions and replies
        if reason != "mention" && reason != "reply" {
            continue;
        }

        let uri = match notif["uri"].as_str() {
            Some(u) => u,
            None => continue,
        };

        // Skip already processed
        if state.processed.contains(uri) {
            continue;
        }

        // Skip if before last_seen on first load
        if let Some(ref last) = state.last_seen {
            if let Some(indexed) = notif["indexedAt"].as_str() {
                if indexed <= last.as_str() && !state.processed.is_empty() {
                    continue;
                }
            }
        }

        // Admin filter: only respond to admin
        let author_did = match notif["author"]["did"].as_str() {
            Some(d) => d,
            None => continue,
        };
        if author_did != admin_did {
            continue;
        }

        if let Some(parsed) = parse_notification(notif) {
            new_items.push(parsed);
        }
    }

    // Process in chronological order (oldest first)
    new_items.reverse();

    for notif in &new_items {
        eprintln!(
            "bot: processing notification from @{}: {}",
            notif.author_handle,
            if notif.text.chars().count() > 50 {
                format!("{}...", notif.text.chars().take(50).collect::<String>())
            } else {
                notif.text.clone()
            }
        );

        // Send to persistent Claude session
        let response = match claude.send(&notif.text).await {
            Ok(r) => r,
            Err(e) => {
                eprintln!("bot: claude error: {}, respawning session...", e);
                // Try to respawn session
                match ClaudeSession::spawn().await {
                    Ok(new_session) => {
                        *claude = new_session;
                        eprintln!("bot: claude session respawned");
                        // Retry once with fresh session
                        match claude.send(&notif.text).await {
                            Ok(r) => r,
                            Err(e2) => {
                                eprintln!("bot: claude retry failed: {}", e2);
                                continue;
                            }
                        }
                    }
                    Err(e2) => {
                        eprintln!("bot: claude respawn failed: {}", e2);
                        continue;
                    }
                }
            }
        };

        // Post reply
        match post_reply(
            &client,
            &session,
            &response,
            &notif.root_uri,
            &notif.root_cid,
            &notif.parent_uri,
            &notif.parent_cid,
        )
        .await
        {
            Ok(result) => {
                eprintln!("bot: replied -> {}", result.uri);
                state.processed.insert(notif.uri.clone());
                if let Err(e) = save_state(state) {
                    eprintln!("bot: failed to save state: {}", e);
                }
            }
            Err(e) => {
                eprintln!("bot: reply failed for {}: {}", notif.uri, e);
                continue;
            }
        }
    }

    // Update last_seen to newest notification timestamp
    if let Some(newest) = notifications.first() {
        if let Some(ts) = newest["indexedAt"].as_str() {
            state.last_seen = Some(ts.to_string());
        }
    }

    // Mark notifications as seen
    if !new_items.is_empty() {
        let now = chrono::Utc::now()
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string();
        let seen_body = serde_json::json!({ "seenAt": now });
        let _ = client
            .call_no_response(
                &app_bsky_notification::UPDATE_SEEN,
                &seen_body,
                &session.access_jwt,
            )
            .await;
    }

    // Prune old entries if over 1000
    if state.processed.len() > 1000 {
        let drain_count = state.processed.len() - 500;
        let to_remove: Vec<String> = state.processed.iter().take(drain_count).cloned().collect();
        for key in to_remove {
            state.processed.remove(&key);
        }
        if let Err(e) = save_state(state) {
            eprintln!("bot: failed to save pruned state: {}", e);
        }
    }

    Ok(())
}
