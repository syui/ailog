use anyhow::{Result, Context};
use colored::Colorize;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tokio::time::{sleep, Duration, interval};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use toml;
use reqwest;

use super::auth::{load_config, load_config_with_refresh, AuthConfig};

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct BlogPost {
    title: String,
    href: String,
    #[serde(rename = "formated_time")]
    #[allow(dead_code)]
    date: String,
    #[allow(dead_code)]
    tags: Vec<String>,
    #[allow(dead_code)]
    contents: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct BlogIndex {
    #[allow(dead_code)]
    posts: Vec<BlogPost>,
}

#[derive(Debug, Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    options: OllamaOptions,
}

#[derive(Debug, Serialize)]
struct OllamaOptions {
    temperature: f32,
    top_p: f32,
    num_predict: i32,
}

#[derive(Debug, Deserialize)]
struct OllamaResponse {
    response: String,
}

// Load collection config with priority: env vars > project config.toml > defaults
fn load_collection_config(project_dir: Option<&Path>) -> Result<(String, String)> {
    // 1. Check environment variables first (highest priority)
    if let Ok(base_collection) = std::env::var("VITE_OAUTH_COLLECTION") {
        println!("{}", "📂 Using collection config from environment variables".cyan());
        let collection_user = format!("{}.user", base_collection);
        return Ok((base_collection, collection_user));
    }

    // 2. Try to load from project config.toml (second priority)
    if let Some(project_path) = project_dir {
        match load_collection_config_from_project(project_path) {
            Ok(config) => {
                println!("{}", format!("📂 Using collection config from: {}", project_path.display()).cyan());
                return Ok(config);
            }
            Err(e) => {
                println!("{}", format!("⚠️  Failed to load project config: {}", e).yellow());
                println!("{}", "📂 Falling back to default collections".cyan());
            }
        }
    }

    // 3. Use defaults (lowest priority)
    println!("{}", "📂 Using default collection configuration".cyan());
    Ok(("ai.syui.log".to_string(), "ai.syui.log.user".to_string()))
}

// Load collection config from project's config.toml
fn load_collection_config_from_project(project_dir: &Path) -> Result<(String, String)> {
    let config_path = project_dir.join("config.toml");
    if !config_path.exists() {
        return Err(anyhow::anyhow!("config.toml not found in {}", project_dir.display()));
    }

    let config_content = fs::read_to_string(&config_path)
        .with_context(|| format!("Failed to read config.toml from {}", config_path.display()))?;
    
    let config: toml::Value = config_content.parse()
        .with_context(|| "Failed to parse config.toml")?;

    let oauth_config = config.get("oauth")
        .and_then(|v| v.as_table())
        .ok_or_else(|| anyhow::anyhow!("No [oauth] section found in config.toml"))?;

    // Use new simplified collection structure (base collection)
    let collection_base = oauth_config.get("collection")
        .and_then(|v| v.as_str())
        .unwrap_or("ai.syui.log")
        .to_string();

    // Derive user collection from base
    let collection_user = format!("{}.user", collection_base);

    Ok((collection_base, collection_user))
}

#[derive(Debug, Serialize, Deserialize)]
struct JetstreamMessage {
    collection: Option<String>,
    commit: Option<JetstreamCommit>,
    did: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JetstreamCommit {
    operation: Option<String>,
    uri: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UserRecord {
    did: String,
    handle: String,
    pds: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct UserListRecord {
    #[serde(rename = "$type")]
    record_type: String,
    users: Vec<UserRecord>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedBy")]
    updated_by: UserInfo,
    metadata: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct UserInfo {
    did: String,
    handle: String,
}

fn get_pid_file() -> Result<PathBuf> {
    let home = std::env::var("HOME").context("HOME environment variable not set")?;
    let pid_dir = PathBuf::from(home).join(".config").join("syui").join("ai").join("log");
    fs::create_dir_all(&pid_dir)?;
    Ok(pid_dir.join("stream.pid"))
}

pub async fn start(project_dir: Option<PathBuf>, daemon: bool, ai_generate: bool) -> Result<()> {
    let mut config = load_config_with_refresh().await?;
    
    // Load collection config with priority: env vars > project config > defaults
    let (collection_comment, _collection_user) = load_collection_config(project_dir.as_deref())?;
    
    // Update config with loaded collections
    config.collections.base = collection_comment.clone();
    config.jetstream.collections = vec![collection_comment];
    
    let pid_file = get_pid_file()?;
    
    // Check if already running
    if pid_file.exists() {
        let pid = fs::read_to_string(&pid_file)?;
        println!("{}", format!("⚠️  Stream monitor already running (PID: {})", pid.trim()).yellow());
        println!("Use 'ailog stream stop' to stop it first.");
        return Ok(());
    }
    
    if daemon {
        println!("{}", "🚀 Starting stream monitor as daemon...".cyan());
        
        // Fork process for daemon mode
        let current_exe = std::env::current_exe()?;
        let mut args = vec!["stream".to_string(), "start".to_string()];
        
        // Add project_dir argument if provided
        if let Some(project_path) = &project_dir {
            args.push(project_path.to_string_lossy().to_string());
        }
        
        // Add ai_generate flag if enabled
        if ai_generate {
            args.push("--ai-generate".to_string());
        }
        
        let child = Command::new(current_exe)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;
        
        // Save PID
        fs::write(&pid_file, child.id().to_string())?;
        
        println!("{}", format!("✅ Stream monitor started as daemon (PID: {})", child.id()).green());
        println!("Use 'ailog stream status' to check status");
        println!("Use 'ailog stream stop' to stop monitoring");
        
        return Ok(());
    }
    
    // Save current process PID for non-daemon mode
    let pid = std::process::id();
    fs::write(&pid_file, pid.to_string())?;
    
    println!("{}", "🎯 Starting ATProto stream monitor...".cyan());
    println!("👤 Authenticated as: {}", config.admin.handle.green());
    println!("📡 Connecting to: {}", config.jetstream.url);
    println!("📂 Monitoring collections: {}", config.jetstream.collections.join(", "));
    println!();
    
    // Setup graceful shutdown
    let pid_file_clone = pid_file.clone();
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.ok();
        println!("\n{}", "🛑 Shutting down stream monitor...".yellow());
        let _ = fs::remove_file(&pid_file_clone);
        std::process::exit(0);
    });
    
    // Start monitoring
    let mut reconnect_attempts = 0;
    let max_reconnect_attempts = 10;
    let mut config = config; // Make config mutable for token refresh
    
    // Start AI generation monitor if enabled
    if ai_generate {
        let ai_config = config.clone();
        tokio::spawn(async move {
            loop {
                if let Err(e) = run_ai_generation_monitor(&ai_config).await {
                    println!("{}", format!("❌ AI generation monitor error: {}", e).red());
                    sleep(Duration::from_secs(60)).await; // Wait 1 minute before retry
                }
            }
        });
    }
    
    loop {
        match run_monitor(&mut config).await {
            Ok(_) => {
                println!("{}", "Monitor loop ended normally".blue());
                break;
            }
            Err(e) => {
                reconnect_attempts += 1;
                if reconnect_attempts <= max_reconnect_attempts {
                    let delay = std::cmp::min(5 * reconnect_attempts, 30);
                    println!("{}", format!("❌ Monitor error: {}", e).red());
                    
                    // Show debug information
                    if reconnect_attempts == 1 {
                        println!("{}", "🔍 Debug information:".yellow());
                        println!("   - Jetstream URL: {}", config.jetstream.url);
                        println!("   - Collections: {:?}", config.jetstream.collections);
                        
                        // Test basic connectivity
                        println!("{}", "🧪 Testing basic connectivity...".cyan());
                        test_connectivity().await;
                    }
                    
                    println!("{}", format!("🔄 Reconnecting in {}s... ({}/{})", 
                             delay, reconnect_attempts, max_reconnect_attempts).yellow());
                    sleep(Duration::from_secs(delay)).await;
                } else {
                    println!("{}", "❌ Max reconnection attempts reached".red());
                    let _ = fs::remove_file(&pid_file);
                    return Err(e);
                }
            }
        }
    }
    
    let _ = fs::remove_file(&pid_file);
    Ok(())
}

async fn run_monitor(config: &mut AuthConfig) -> Result<()> {
    // Connect to Jetstream
    println!("{}", format!("🔗 Attempting to connect to: {}", config.jetstream.url).blue());
    
    // Create request with HTTP/1.1 headers to ensure WebSocket compatibility
    let request = tungstenite::http::Request::builder()
        .method("GET")
        .uri(&config.jetstream.url)
        .header("Host", config.jetstream.url.replace("wss://", "").replace("/subscribe", ""))
        .header("Upgrade", "websocket")
        .header("Connection", "Upgrade")
        .header("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
        .header("Sec-WebSocket-Version", "13")
        .body(())?;
    
    let (ws_stream, response) = connect_async(request).await
        .with_context(|| format!("Failed to connect to Jetstream at {}", config.jetstream.url))?;
    
    println!("{}", format!("📡 WebSocket handshake status: {}", response.status()).blue());
    
    println!("{}", "✅ Connected to Jetstream".green());
    
    // Since Jetstream may not include custom collections, we'll use a hybrid approach:
    // 1. Keep WebSocket connection for any potential custom collection events
    // 2. Add periodic polling for ai.syui.log collection
    
    let (mut write, mut read) = ws_stream.split();
    
    // Subscribe to collections
    let subscribe_msg = json!({
        "wantedCollections": config.jetstream.collections
    });
    
    write.send(Message::Text(subscribe_msg.to_string())).await?;
    println!("{}", "📨 Subscribed to collections".blue());
    
    // Start periodic polling task
    let config_clone = config.clone();
    let polling_task = tokio::spawn(async move {
        poll_comments_periodically(config_clone).await
    });
    
    // Process WebSocket messages
    let ws_task = async {
        while let Some(msg) = read.next().await {
            match msg? {
                Message::Text(text) => {
                    // Filter out standard Bluesky collections for cleaner output
                    let should_debug = std::env::var("AILOG_DEBUG").is_ok();
                    let is_standard_collection = text.contains("app.bsky.feed.") || 
                                               text.contains("app.bsky.actor.") ||
                                               text.contains("app.bsky.graph.");
                    
                    // Only show debug for custom collections or when explicitly requested
                    if should_debug && (!is_standard_collection || std::env::var("AILOG_DEBUG_ALL").is_ok()) {
                        println!("{}", format!("🔍 Received: {}", text).blue());
                    }
                    
                    if let Err(e) = handle_message(&text, config).await {
                        println!("{}", format!("⚠️  Failed to handle message: {}", e).yellow());
                    }
                }
                Message::Close(_) => {
                    println!("{}", "🔌 WebSocket closed by server".yellow());
                    break;
                }
                _ => {}
            }
        }
        Ok::<(), anyhow::Error>(())
    };
    
    // Run both tasks concurrently
    tokio::select! {
        result = polling_task => {
            match result {
                Ok(Ok(_)) => println!("{}", "📊 Polling task completed".blue()),
                Ok(Err(e)) => println!("{}", format!("❌ Polling task error: {}", e).red()),
                Err(e) => println!("{}", format!("❌ Polling task panic: {}", e).red()),
            }
        }
        result = ws_task => {
            match result {
                Ok(_) => println!("{}", "📡 WebSocket task completed".blue()),
                Err(e) => println!("{}", format!("❌ WebSocket task error: {}", e).red()),
            }
        }
    }
    
    Ok(())
}

async fn handle_message(text: &str, config: &mut AuthConfig) -> Result<()> {
    let message: JetstreamMessage = serde_json::from_str(text)?;
    
    // Debug: Check all received collections (but filter standard ones)
    if let Some(collection) = &message.collection {
        let is_standard_collection = collection.starts_with("app.bsky.");
        
        if std::env::var("AILOG_DEBUG").is_ok() && (!is_standard_collection || std::env::var("AILOG_DEBUG_ALL").is_ok()) {
            println!("{}", format!("📂 Collection: {}", collection).cyan());
        }
        
        // Skip processing standard Bluesky collections
        if is_standard_collection {
            return Ok(());
        }
    }
    
    // Check if this is a comment creation
    if let (Some(collection), Some(commit), Some(did)) = 
        (&message.collection, &message.commit, &message.did) {
        
        if collection == &config.collections.comment() && commit.operation.as_deref() == Some("create") {
            let unknown_uri = "unknown".to_string();
            let uri = commit.uri.as_ref().unwrap_or(&unknown_uri);
            
            println!("{}", "🆕 New comment detected!".green().bold());
            println!("   📝 URI: {}", uri);
            println!("   👤 Author DID: {}", did);
            
            // Resolve handle
            match resolve_handle(did).await {
                Ok(handle) => {
                    println!("   🏷️  Handle: {}", handle.cyan());
                    
                    // Update user list
                    if let Err(e) = update_user_list(config, did, &handle).await {
                        println!("{}", format!("   ⚠️  Failed to update user list: {}", e).yellow());
                    }
                }
                Err(e) => {
                    println!("{}", format!("   ⚠️  Failed to resolve handle: {}", e).yellow());
                }
            }
            
            println!();
        }
    }
    
    Ok(())
}

async fn resolve_handle(did: &str) -> Result<String> {
    let client = reqwest::Client::new();
    let url = format!("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={}", 
                     urlencoding::encode(did));
    
    let response = client.get(&url).send().await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("Failed to resolve handle: {}", response.status()));
    }
    
    let profile: Value = response.json().await?;
    let handle = profile["handle"].as_str()
        .ok_or_else(|| anyhow::anyhow!("Handle not found in profile response"))?;
    
    Ok(handle.to_string())
}

async fn update_user_list(config: &mut AuthConfig, did: &str, handle: &str) -> Result<()> {
    // Get current user list
    let current_users = get_current_user_list(config).await?;
    
    // Check if user already exists
    if current_users.iter().any(|u| u.did == did) {
        println!("   ℹ️  User already in list: {}", handle.blue());
        return Ok(());
    }
    
    println!("   ➕ Adding new user to list: {}", handle.green());
    
    // Detect PDS
    let pds = if handle.ends_with(".syu.is") {
        "https://syu.is"
    } else {
        "https://bsky.social"
    };
    
    // Add new user
    let new_user = UserRecord {
        did: did.to_string(),
        handle: handle.to_string(),
        pds: pds.to_string(),
    };
    
    let mut updated_users = current_users;
    updated_users.push(new_user);
    
    // Post updated user list
    post_user_list(config, &updated_users, json!({
        "reason": "auto_add_commenter",
        "trigger_did": did,
        "trigger_handle": handle
    })).await?;
    
    println!("{}", "   ✅ User list updated successfully".green());
    
    Ok(())
}

async fn get_current_user_list(config: &mut AuthConfig) -> Result<Vec<UserRecord>> {
    let client = reqwest::Client::new();
    let url = format!("{}/xrpc/com.atproto.repo.listRecords?repo={}&collection={}&limit=10",
                     config.admin.pds,
                     urlencoding::encode(&config.admin.did),
                     urlencoding::encode(&config.collections.user()));
    
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.admin.access_jwt))
        .send()
        .await?;
    
    if !response.status().is_success() {
        if response.status().as_u16() == 401 {
            // Token expired, try to refresh
            if let Ok(_) = super::auth::load_config_with_refresh().await {
                // Retry with refreshed token  
                let refreshed_config = super::auth::load_config()?;
                *config = refreshed_config;
                return Box::pin(get_current_user_list(config)).await;
            }
        }
        return Ok(Vec::new());
    }
    
    let data: Value = response.json().await?;
    let empty_vec = vec![];
    let records = data["records"].as_array().unwrap_or(&empty_vec);
    
    if records.is_empty() {
        return Ok(Vec::new());
    }
    
    // Get the latest record
    let latest_record = &records[0];
    let empty_users = vec![];
    let users = latest_record["value"]["users"].as_array().unwrap_or(&empty_users);
    
    let mut user_list = Vec::new();
    for user in users {
        if let (Some(did), Some(handle), Some(pds)) = (
            user["did"].as_str(),
            user["handle"].as_str(),
            user["pds"].as_str(),
        ) {
            user_list.push(UserRecord {
                did: did.to_string(),
                handle: handle.to_string(),
                pds: pds.to_string(),
            });
        }
    }
    
    Ok(user_list)
}

async fn post_user_list(config: &mut AuthConfig, users: &[UserRecord], metadata: Value) -> Result<()> {
    let client = reqwest::Client::new();
    
    let now = chrono::Utc::now();
    // Extract short ID from DID (did:plc:xxx -> xxx) for rkey
    let short_did = config.admin.did
        .strip_prefix("did:plc:")
        .unwrap_or(&config.admin.did);
    let rkey = format!("{}-{}", short_did, now.format("%Y-%m-%dT%H-%M-%S-%3fZ").to_string().replace(".", "-"));
    
    let record = UserListRecord {
        record_type: config.collections.user(),
        users: users.to_vec(),
        created_at: now.to_rfc3339(),
        updated_by: UserInfo {
            did: config.admin.did.clone(),
            handle: config.admin.handle.clone(),
        },
        metadata: Some(metadata.clone()),
    };
    
    let url = format!("{}/xrpc/com.atproto.repo.putRecord", config.admin.pds);
    
    let request_body = json!({
        "repo": config.admin.did,
        "collection": config.collections.user(),
        "rkey": rkey,
        "record": record
    });
    
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.admin.access_jwt))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await?;
    
    if !response.status().is_success() {
        let status = response.status();
        if status.as_u16() == 401 {
            // Token expired, try to refresh and retry
            if let Ok(_) = super::auth::load_config_with_refresh().await {
                let refreshed_config = super::auth::load_config()?;
                *config = refreshed_config;
                return Box::pin(post_user_list(config, users, metadata)).await;
            }
        }
        let error_text = response.text().await?;
        return Err(anyhow::anyhow!("Failed to post user list: {} - {}", status, error_text));
    }
    
    Ok(())
}

pub async fn stop() -> Result<()> {
    let pid_file = get_pid_file()?;
    
    if !pid_file.exists() {
        println!("{}", "ℹ️  Stream monitor is not running.".blue());
        return Ok(());
    }
    
    let pid_str = fs::read_to_string(&pid_file)?;
    let pid = pid_str.trim();
    
    println!("{}", format!("🛑 Stopping stream monitor (PID: {})...", pid).cyan());
    
    // Try to kill the process
    let output = Command::new("kill")
        .arg(pid)
        .output()?;
    
    if output.status.success() {
        // Wait a bit for the process to stop
        sleep(Duration::from_secs(2)).await;
        
        // Remove PID file
        fs::remove_file(&pid_file)?;
        
        println!("{}", "✅ Stream monitor stopped successfully".green());
    } else {
        println!("{}", format!("⚠️  Failed to stop process: {}", 
                 String::from_utf8_lossy(&output.stderr)).yellow());
        
        // Force remove PID file anyway
        fs::remove_file(&pid_file)?;
    }
    
    Ok(())
}

pub async fn status() -> Result<()> {
    let pid_file = get_pid_file()?;
    
    println!("{}", "📊 Stream Monitor Status".cyan().bold());
    println!("─────────────────────────");
    
    if !pid_file.exists() {
        println!("{}", "📴 Status: Not running".red());
        return Ok(());
    }
    
    let pid_str = fs::read_to_string(&pid_file)?;
    let pid = pid_str.trim();
    
    // Check if process is actually running
    let output = Command::new("ps")
        .args(&["-p", pid])
        .output()?;
    
    if output.status.success() {
        println!("{}", "✅ Status: Running".green());
        println!("🆔 PID: {}", pid);
        println!("📁 PID file: {}", pid_file.display());
        
        // Show config info
        match load_config() {
            Ok(config) => {
                println!("👤 Authenticated as: {}", config.admin.handle);
                println!("📡 Jetstream URL: {}", config.jetstream.url);
                println!("📂 Monitoring: {}", config.jetstream.collections.join(", "));
            }
            Err(_) => {
                println!("{}", "⚠️  No authentication config found".yellow());
            }
        }
    } else {
        println!("{}", "❌ Status: Process not found (stale PID file)".red());
        println!("🗑️  Removing stale PID file...");
        fs::remove_file(&pid_file)?;
    }
    
    Ok(())
}

async fn test_connectivity() {
    let endpoints = [
        "wss://jetstream2.us-east.bsky.network/subscribe",
        "wss://jetstream1.us-east.bsky.network/subscribe", 
        "wss://jetstream2.us-west.bsky.network/subscribe",
    ];
    
    for endpoint in &endpoints {
        print!("   Testing {}: ", endpoint);
        
        // Test basic HTTP connectivity first
        let http_url = endpoint.replace("wss://", "https://").replace("/subscribe", "");
        match reqwest::Client::new()
            .head(&http_url)
            .timeout(Duration::from_secs(5))
            .send()
            .await 
        {
            Ok(response) => {
                if response.status().as_u16() == 405 {
                    println!("{}", "✅ HTTP reachable".green());
                } else {
                    println!("{}", format!("⚠️  HTTP status: {}", response.status()).yellow());
                }
            }
            Err(e) => {
                println!("{}", format!("❌ HTTP failed: {}", e).red());
                continue;
            }
        }
        
        // Test WebSocket connectivity  
        print!("   WebSocket {}: ", endpoint);
        match tokio::time::timeout(Duration::from_secs(5), connect_async(*endpoint)).await {
            Ok(Ok(_)) => println!("{}", "✅ Connected".green()),
            Ok(Err(e)) => println!("{}", format!("❌ Failed: {}", e).red()),
            Err(_) => println!("{}", "❌ Timeout".red()),
        }
    }
}

async fn poll_comments_periodically(mut config: AuthConfig) -> Result<()> {
    println!("{}", "📊 Starting periodic comment polling...".cyan());
    
    let mut known_comments = HashSet::new();
    let mut interval = interval(Duration::from_secs(30)); // Poll every 30 seconds
    
    // Initial population of known comments
    if let Ok(comments) = get_recent_comments(&mut config).await {
        for comment in &comments {
            if let Some(uri) = comment.get("uri").and_then(|v| v.as_str()) {
                known_comments.insert(uri.to_string());
                if std::env::var("AILOG_DEBUG").is_ok() {
                    println!("{}", format!("🔍 Existing comment: {}", uri).blue());
                }
            }
        }
        println!("{}", format!("📝 Found {} existing comments", known_comments.len()).blue());
        
        // Debug: Show full response for first comment
        if std::env::var("AILOG_DEBUG").is_ok() && !comments.is_empty() {
            println!("{}", format!("🔍 Sample comment data: {}", serde_json::to_string_pretty(&comments[0]).unwrap_or_default()).yellow());
        }
    } else {
        println!("{}", "⚠️  Failed to get initial comments".yellow());
    }
    
    loop {
        interval.tick().await;
        
        if std::env::var("AILOG_DEBUG").is_ok() {
            println!("{}", "🔄 Polling for new comments...".cyan());
        }
        
        match get_recent_comments(&mut config).await {
            Ok(comments) => {
                if std::env::var("AILOG_DEBUG").is_ok() {
                    println!("{}", format!("📊 Retrieved {} comments from API", comments.len()).cyan());
                }
                
                for comment in comments {
                    if let (Some(uri), Some(value)) = (
                        comment.get("uri").and_then(|v| v.as_str()),
                        comment.get("value")
                    ) {
                        if !known_comments.contains(uri) {
                            // New comment detected
                            known_comments.insert(uri.to_string());
                            
                            if let Some(created_at) = value.get("createdAt").and_then(|v| v.as_str()) {
                                // Check if this comment is recent (within last 5 minutes)
                                if is_recent_comment(created_at) {
                                    println!("{}", "🆕 New comment detected via polling!".green().bold());
                                    println!("   📝 URI: {}", uri);
                                    
                                    // Extract author DID from URI
                                    if let Some(did) = extract_did_from_uri(uri) {
                                        println!("   👤 Author DID: {}", did);
                                        
                                        // Resolve handle and update user list
                                        match resolve_handle(&did).await {
                                            Ok(handle) => {
                                                println!("   🏷️  Handle: {}", handle.cyan());
                                                
                                                if let Err(e) = update_user_list(&mut config, &did, &handle).await {
                                                    println!("{}", format!("   ⚠️  Failed to update user list: {}", e).yellow());
                                                }
                                            }
                                            Err(e) => {
                                                println!("{}", format!("   ⚠️  Failed to resolve handle: {}", e).yellow());
                                            }
                                        }
                                    }
                                    
                                    println!();
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                println!("{}", format!("⚠️  Failed to poll comments: {}", e).yellow());
            }
        }
    }
}

async fn get_recent_comments(config: &mut AuthConfig) -> Result<Vec<Value>> {
    let client = reqwest::Client::new();
    let url = format!("{}/xrpc/com.atproto.repo.listRecords?repo={}&collection={}&limit=20",
                     config.admin.pds,
                     urlencoding::encode(&config.admin.did),
                     urlencoding::encode(&config.collections.comment()));
    
    if std::env::var("AILOG_DEBUG").is_ok() {
        println!("{}", format!("🌐 API Request URL: {}", url).yellow());
    }
    
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.admin.access_jwt))
        .send()
        .await?;
    
    if !response.status().is_success() {
        if std::env::var("AILOG_DEBUG").is_ok() {
            println!("{}", format!("❌ API Error: {} {}", response.status(), response.status().canonical_reason().unwrap_or("Unknown")).red());
        }
        
        if response.status().as_u16() == 401 {
            // Token expired, try to refresh
            if let Ok(_) = super::auth::load_config_with_refresh().await {
                let refreshed_config = super::auth::load_config()?;
                *config = refreshed_config;
                return Box::pin(get_recent_comments(config)).await;
            }
        }
        return Err(anyhow::anyhow!("Failed to fetch comments: {}", response.status()));
    }
    
    let data: Value = response.json().await?;
    
    if std::env::var("AILOG_DEBUG").is_ok() {
        println!("{}", format!("📄 Raw API Response: {}", serde_json::to_string_pretty(&data).unwrap_or_default()).magenta());
    }
    
    let empty_vec = vec![];
    let records = data["records"].as_array().unwrap_or(&empty_vec);
    
    Ok(records.to_vec())
}

fn is_recent_comment(created_at: &str) -> bool {
    use chrono::{DateTime, Utc, Duration};
    
    if let Ok(comment_time) = DateTime::parse_from_rfc3339(created_at) {
        let now = Utc::now();
        let comment_utc = comment_time.with_timezone(&Utc);
        let diff = now.signed_duration_since(comment_utc);
        
        // Consider comments from the last 5 minutes as "recent"
        diff <= Duration::minutes(5) && diff >= Duration::zero()
    } else {
        false
    }
}

fn extract_did_from_uri(uri: &str) -> Option<String> {
    // URI format: at://did:plc:xxx/ai.syui.log/yyy
    if let Some(captures) = uri.strip_prefix("at://") {
        if let Some(end) = captures.find("/") {
            return Some(captures[..end].to_string());
        }
    }
    None
}

pub async fn test_api() -> Result<()> {
    println!("{}", "🧪 Testing API access to comments collection...".cyan().bold());
    
    let mut config = load_config_with_refresh().await?;
    
    println!("👤 Testing as: {}", config.admin.handle.green());
    println!("🌐 PDS: {}", config.admin.pds);
    println!("🆔 DID: {}", config.admin.did);
    println!();
    
    // Test API access
    match get_recent_comments(&mut config).await {
        Ok(comments) => {
            println!("{}", format!("✅ Successfully retrieved {} comments", comments.len()).green());
            
            if comments.is_empty() {
                println!("{}", format!("ℹ️  No comments found in {} collection", config.collections.comment()).blue());
                println!("💡 Try posting a comment first using the web interface");
            } else {
                println!("{}", "📝 Comment details:".cyan());
                for (i, comment) in comments.iter().enumerate() {
                    println!("   {}. URI: {}", i + 1, 
                             comment.get("uri").and_then(|v| v.as_str()).unwrap_or("N/A"));
                    
                    if let Some(value) = comment.get("value") {
                        if let Some(created_at) = value.get("createdAt").and_then(|v| v.as_str()) {
                            println!("      Created: {}", created_at);
                        }
                        if let Some(text) = value.get("text").and_then(|v| v.as_str()) {
                            let preview = if text.len() > 50 {
                                format!("{}...", &text[..50])
                            } else {
                                text.to_string()
                            };
                            println!("      Text: {}", preview);
                        }
                    }
                    println!();
                }
            }
        }
        Err(e) => {
            println!("{}", format!("❌ API test failed: {}", e).red());
            return Err(e);
        }
    }
    
    Ok(())
}

// AI content generation functions
async fn generate_ai_content(content: &str, prompt_type: &str, ollama_host: &str) -> Result<String> {
    let model = "gemma3:4b";
    
    let prompt = match prompt_type {
        "translate" => format!("Translate the following Japanese blog post to English. Keep the technical terms and code blocks intact:\n\n{}", content),
        "comment" => format!("Read this blog post and provide an insightful comment about it. Focus on the key points and add your perspective:\n\n{}", content),
        _ => return Err(anyhow::anyhow!("Unknown prompt type: {}", prompt_type)),
    };

    let request = OllamaRequest {
        model: model.to_string(),
        prompt,
        stream: false,
        options: OllamaOptions {
            temperature: 0.9,
            top_p: 0.9,
            num_predict: 500,
        },
    };

    let client = reqwest::Client::new();
    
    // Try localhost first (for same-server deployment)
    let localhost_url = "http://localhost:11434/api/generate";
    match client.post(localhost_url).json(&request).send().await {
        Ok(response) if response.status().is_success() => {
            let ollama_response: OllamaResponse = response.json().await?;
            println!("{}", "✅ Used localhost Ollama".green());
            return Ok(ollama_response.response);
        }
        _ => {
            println!("{}", "⚠️ Localhost Ollama not available, trying remote...".yellow());
        }
    }
    
    // Fallback to remote host
    let remote_url = format!("{}/api/generate", ollama_host);
    let response = client.post(&remote_url).json(&request).send().await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("Ollama API request failed: {}", response.status()));
    }
    
    let ollama_response: OllamaResponse = response.json().await?;
    println!("{}", "✅ Used remote Ollama".green());
    Ok(ollama_response.response)
}

async fn run_ai_generation_monitor(config: &AuthConfig) -> Result<()> {
    let blog_host = "https://syui.ai"; // TODO: Load from config
    let ollama_host = "https://ollama.syui.ai"; // TODO: Load from config  
    let ai_did = "did:plc:4hqjfn7m6n5hno3doamuhgef"; // TODO: Load from config
    
    println!("{}", "🤖 Starting AI content generation monitor...".cyan());
    println!("📡 Blog host: {}", blog_host);
    println!("🧠 Ollama host: {}", ollama_host);
    println!("🤖 AI DID: {}", ai_did);
    println!();
    
    let mut interval = interval(Duration::from_secs(300)); // Check every 5 minutes
    let client = reqwest::Client::new();
    
    loop {
        interval.tick().await;
        
        println!("{}", "🔍 Checking for new blog posts...".blue());
        
        match check_and_process_new_posts(&client, config, blog_host, ollama_host, ai_did).await {
            Ok(count) => {
                if count > 0 {
                    println!("{}", format!("✅ Processed {} new posts", count).green());
                } else {
                    println!("{}", "ℹ️ No new posts found".blue());
                }
            }
            Err(e) => {
                println!("{}", format!("❌ Error processing posts: {}", e).red());
            }
        }
        
        println!("{}", "⏰ Waiting for next check...".cyan());
    }
}

async fn check_and_process_new_posts(
    client: &reqwest::Client,
    config: &AuthConfig,
    blog_host: &str,
    ollama_host: &str,
    ai_did: &str,
) -> Result<usize> {
    // Fetch blog index
    let index_url = format!("{}/index.json", blog_host);
    let response = client.get(&index_url).send().await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("Failed to fetch blog index: {}", response.status()));
    }
    
    let blog_posts: Vec<BlogPost> = response.json().await?;
    println!("{}", format!("📄 Found {} posts in blog index", blog_posts.len()).cyan());
    
    // Get existing AI generated content from collections
    let existing_lang_records = get_existing_records(config, &config.collections.chat_lang()).await?;
    let existing_comment_records = get_existing_records(config, &config.collections.chat_comment()).await?;
    
    let mut processed_count = 0;
    
    for post in blog_posts {
        let post_slug = extract_slug_from_url(&post.href);
        
        // Check if translation already exists
        let translation_exists = existing_lang_records.iter().any(|record| {
            record.get("value")
                .and_then(|v| v.get("post_slug"))
                .and_then(|s| s.as_str())
                == Some(&post_slug)
        });
        
        // Check if comment already exists  
        let comment_exists = existing_comment_records.iter().any(|record| {
            record.get("value")
                .and_then(|v| v.get("post_slug"))
                .and_then(|s| s.as_str())
                == Some(&post_slug)
        });
        
        // Generate translation if not exists
        if !translation_exists {
            match generate_and_store_translation(client, config, &post, ollama_host, ai_did).await {
                Ok(_) => {
                    println!("{}", format!("✅ Generated translation for: {}", post.title).green());
                    processed_count += 1;
                }
                Err(e) => {
                    println!("{}", format!("❌ Failed to generate translation for {}: {}", post.title, e).red());
                }
            }
        }
        
        // Generate comment if not exists
        if !comment_exists {
            match generate_and_store_comment(client, config, &post, ollama_host, ai_did).await {
                Ok(_) => {
                    println!("{}", format!("✅ Generated comment for: {}", post.title).green());
                    processed_count += 1;
                }
                Err(e) => {
                    println!("{}", format!("❌ Failed to generate comment for {}: {}", post.title, e).red());
                }
            }
        }
    }
    
    Ok(processed_count)
}

async fn get_existing_records(config: &AuthConfig, collection: &str) -> Result<Vec<serde_json::Value>> {
    let client = reqwest::Client::new();
    let url = format!("{}/xrpc/com.atproto.repo.listRecords?repo={}&collection={}&limit=100",
                     config.admin.pds,
                     urlencoding::encode(&config.admin.did),
                     urlencoding::encode(collection));
    
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.admin.access_jwt))
        .send()
        .await?;
    
    if !response.status().is_success() {
        return Ok(Vec::new()); // Return empty if collection doesn't exist yet
    }
    
    let list_response: serde_json::Value = response.json().await?;
    let records = list_response["records"].as_array().unwrap_or(&Vec::new()).clone();
    
    Ok(records)
}

fn extract_slug_from_url(url: &str) -> String {
    // Extract slug from URL like "/posts/2025-06-06-ailog.html"
    url.split('/')
        .last()
        .unwrap_or("")
        .trim_end_matches(".html")
        .to_string()
}

async fn generate_and_store_translation(
    client: &reqwest::Client,
    config: &AuthConfig,
    post: &BlogPost,
    ollama_host: &str,
    ai_did: &str,
) -> Result<()> {
    // Generate translation
    let translation = generate_ai_content(&post.title, "translate", ollama_host).await?;
    
    // Store in ai.syui.log.chat.lang collection
    let record_data = serde_json::json!({
        "post_slug": extract_slug_from_url(&post.href),
        "post_title": post.title,
        "post_url": post.href,
        "lang": "en",
        "content": translation,
        "generated_at": chrono::Utc::now().to_rfc3339(),
        "ai_did": ai_did
    });
    
    store_atproto_record(client, config, &config.collections.chat_lang(), &record_data).await
}

async fn generate_and_store_comment(
    client: &reqwest::Client,
    config: &AuthConfig,
    post: &BlogPost,
    ollama_host: &str,
    ai_did: &str,
) -> Result<()> {
    // Generate comment
    let comment = generate_ai_content(&post.title, "comment", ollama_host).await?;
    
    // Store in ai.syui.log.chat.comment collection
    let record_data = serde_json::json!({
        "post_slug": extract_slug_from_url(&post.href),
        "post_title": post.title,
        "post_url": post.href,
        "content": comment,
        "generated_at": chrono::Utc::now().to_rfc3339(),
        "ai_did": ai_did
    });
    
    store_atproto_record(client, config, &config.collections.chat_comment(), &record_data).await
}

async fn store_atproto_record(
    client: &reqwest::Client,
    config: &AuthConfig,
    collection: &str,
    record_data: &serde_json::Value,
) -> Result<()> {
    let url = format!("{}/xrpc/com.atproto.repo.putRecord", config.admin.pds);
    
    let put_request = serde_json::json!({
        "repo": config.admin.did,
        "collection": collection,
        "rkey": uuid::Uuid::new_v4().to_string(),
        "record": record_data
    });
    
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.admin.access_jwt))
        .header("Content-Type", "application/json")
        .json(&put_request)
        .send()
        .await?;
    
    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(anyhow::anyhow!("Failed to store record: {}", error_text));
    }
    
    Ok(())
}