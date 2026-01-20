use anyhow::{anyhow, Result};
use rustyline::error::ReadlineError;
use rustyline::DefaultEditor;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::path::Path;

use crate::commands::token::{self, BUNDLE_ID};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessageResponse,
}

#[derive(Debug, Deserialize)]
struct ChatMessageResponse {
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatRecord {
    uri: String,
    cid: String,
    value: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChatSession {
    root_uri: Option<String>,
    last_uri: Option<String>,
    messages: Vec<ChatMessage>,
}

impl Default for ChatSession {
    fn default() -> Self {
        Self {
            root_uri: None,
            last_uri: None,
            messages: Vec::new(),
        }
    }
}

/// Get system prompt from environment or file
fn get_system_prompt() -> String {
    // 1. Try CHAT_SYSTEM env var directly
    if let Ok(prompt) = env::var("CHAT_SYSTEM") {
        return prompt;
    }

    // 2. Try CHAT_SYSTEM_FILE env var (path to file)
    if let Ok(file_path) = env::var("CHAT_SYSTEM_FILE") {
        if let Ok(content) = fs::read_to_string(&file_path) {
            return content.trim().to_string();
        }
    }

    // 3. Default prompt
    "You are a helpful assistant. Respond concisely.".to_string()
}

/// Create new chat session with system prompt
fn new_session_with_prompt() -> ChatSession {
    ChatSession {
        root_uri: None,
        last_uri: None,
        messages: vec![ChatMessage {
            role: "system".to_string(),
            content: get_system_prompt(),
        }],
    }
}

/// Get session file path
fn session_path() -> Result<std::path::PathBuf> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| anyhow!("Could not find config directory"))?
        .join(BUNDLE_ID);
    fs::create_dir_all(&config_dir)?;
    Ok(config_dir.join("chat_session.json"))
}

/// Load chat session (updates system prompt from current env)
fn load_session() -> Result<ChatSession> {
    let path = session_path()?;
    if path.exists() {
        let content = fs::read_to_string(&path)?;
        let mut session: ChatSession = serde_json::from_str(&content)?;

        // Update system prompt from current environment
        let system_prompt = get_system_prompt();
        if let Some(first) = session.messages.first_mut() {
            if first.role == "system" {
                first.content = system_prompt;
            }
        } else {
            session.messages.insert(0, ChatMessage {
                role: "system".to_string(),
                content: system_prompt,
            });
        }

        Ok(session)
    } else {
        Ok(ChatSession::default())
    }
}

/// Save chat session
fn save_session(session: &ChatSession) -> Result<()> {
    let path = session_path()?;
    let content = serde_json::to_string_pretty(session)?;
    fs::write(&path, content)?;
    Ok(())
}

/// Generate TID
fn generate_tid() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"234567abcdefghijklmnopqrstuvwxyz";
    let mut rng = rand::thread_rng();
    (0..13)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Call LLM API
async fn call_llm(client: &reqwest::Client, url: &str, model: &str, messages: &[ChatMessage]) -> Result<String> {
    let max_tokens = env::var("CHAT_MAX_TOKENS")
        .ok()
        .and_then(|v| v.parse().ok());

    let req = ChatRequest {
        model: model.to_string(),
        messages: messages.to_vec(),
        max_tokens,
    };

    let res = client.post(url).json(&req).send().await?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await?;
        return Err(anyhow!("LLM call failed ({}): {}", status, body));
    }

    let chat_res: ChatResponse = res.json().await?;
    chat_res
        .choices
        .first()
        .map(|c| c.message.content.trim().to_string())
        .ok_or_else(|| anyhow!("No response from LLM"))
}

/// Save chat record to local file
fn save_chat_local(
    output_dir: &str,
    did: &str,
    content: &str,
    author_did: &str,
    root_uri: Option<&str>,
    parent_uri: Option<&str>,
) -> Result<String> {
    let rkey = generate_tid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let uri = format!("at://{}/ai.syui.log.chat/{}", did, rkey);

    let mut value = serde_json::json!({
        "$type": "ai.syui.log.chat",
        "content": content,
        "author": author_did,
        "createdAt": now,
    });

    if let Some(root) = root_uri {
        value["root"] = serde_json::json!(root);
    }
    if let Some(parent) = parent_uri {
        value["parent"] = serde_json::json!(parent);
    }

    let record = ChatRecord {
        uri: uri.clone(),
        cid: format!("bafyrei{}", rkey),
        value,
    };

    // Create directory: {output_dir}/{did}/ai.syui.log.chat/
    let collection_dir = Path::new(output_dir)
        .join(did)
        .join("ai.syui.log.chat");
    fs::create_dir_all(&collection_dir)?;

    // Save record: {rkey}.json
    let file_path = collection_dir.join(format!("{}.json", rkey));
    let json_content = serde_json::to_string_pretty(&record)?;
    fs::write(&file_path, json_content)?;

    // Update index.json
    let index_path = collection_dir.join("index.json");
    let mut rkeys: Vec<String> = if index_path.exists() {
        let index_content = fs::read_to_string(&index_path).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&index_content).unwrap_or_else(|_| Vec::new())
    } else {
        Vec::new()
    };
    if !rkeys.contains(&rkey.to_string()) {
        rkeys.push(rkey.to_string());
        fs::write(&index_path, serde_json::to_string_pretty(&rkeys)?)?;
    }

    Ok(uri)
}

/// Process a single message and get response
async fn process_message(
    client: &reqwest::Client,
    llm_url: &str,
    model: &str,
    output_dir: &str,
    user_did: &str,
    bot_did: &str,
    session: &mut ChatSession,
    input: &str,
) -> Result<String> {
    // Add user message to history
    session.messages.push(ChatMessage {
        role: "user".to_string(),
        content: input.to_string(),
    });

    // Save user message to local file
    let user_uri = save_chat_local(
        output_dir,
        user_did,
        input,
        user_did,
        session.root_uri.as_deref(),
        session.last_uri.as_deref(),
    )?;

    // Set root if first message
    if session.root_uri.is_none() {
        session.root_uri = Some(user_uri.clone());
    }

    // Call LLM with full history
    let response = call_llm(client, llm_url, model, &session.messages).await?;

    // Add assistant message to history
    session.messages.push(ChatMessage {
        role: "assistant".to_string(),
        content: response.clone(),
    });

    // Save AI response to local file
    let ai_uri = save_chat_local(
        output_dir,
        bot_did,
        &response,
        bot_did,
        session.root_uri.as_deref(),
        Some(&user_uri),
    )?;

    session.last_uri = Some(ai_uri);

    // Save session
    save_session(session)?;

    Ok(response)
}

/// Run chat - interactive or single message
pub async fn run(input: Option<&str>, new_session: bool) -> Result<()> {
    let chat_url = env::var("CHAT_URL")
        .or_else(|_| env::var("TRANSLATE_URL"))
        .unwrap_or_else(|_| "http://127.0.0.1:1234/v1".to_string());
    let model = env::var("CHAT_MODEL")
        .or_else(|_| env::var("TRANSLATE_MODEL"))
        .unwrap_or_else(|_| "gpt-oss".to_string());
    let output_dir = env::var("CHAT_OUTPUT").unwrap_or_else(|_| {
        // Use absolute path from current working directory
        let cwd = env::current_dir().unwrap_or_default();
        cwd.join("public/content").to_string_lossy().to_string()
    });

    // Load user session for DID
    let user_token = token::load_session()?;
    let user_did = user_token.did.clone();

    // Load bot session for DID (required)
    let bot_did = match token::load_bot_session() {
        Ok(s) => s.did,
        Err(_) => {
            eprintln!("Bot session not found. Please login as bot first:");
            eprintln!("  ailog login <handle> -p <password> -s <server> --bot");
            return Ok(());
        }
    };

    // Load or create chat session
    let mut session = if new_session {
        new_session_with_prompt()
    } else {
        load_session().unwrap_or_else(|_| new_session_with_prompt())
    };

    let client = reqwest::Client::new();
    let llm_url = format!("{}/chat/completions", chat_url);

    // Single message mode
    if let Some(msg) = input {
        let response = process_message(
            &client, &llm_url, &model, &output_dir,
            &user_did, &bot_did, &mut session, msg,
        ).await?;
        println!("{}", response);
        use std::io::Write;
        std::io::stdout().flush()?;
        return Ok(());
    }

    // Interactive mode
    println!("ailog chat (type 'exit' to quit, Ctrl+C to cancel)");
    println!("model: {}", model);
    println!("---");

    let mut rl = DefaultEditor::new()?;

    loop {
        match rl.readline("> ") {
            Ok(line) => {
                let input = line.trim();
                if input.is_empty() {
                    continue;
                }
                if input == "exit" || input == "quit" {
                    break;
                }

                let _ = rl.add_history_entry(input);

                match process_message(
                    &client, &llm_url, &model, &output_dir,
                    &user_did, &bot_did, &mut session, input,
                ).await {
                    Ok(response) => println!("\n{}\n", response),
                    Err(e) => {
                        eprintln!("Error: {}", e);
                        // Remove failed message from history
                        session.messages.pop();
                    }
                }
            }
            Err(ReadlineError::Interrupted) => {
                println!("^C");
                continue;
            }
            Err(ReadlineError::Eof) => {
                break;
            }
            Err(e) => {
                eprintln!("Error: {}", e);
                break;
            }
        }
    }

    Ok(())
}
