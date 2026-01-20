use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::fs;
use std::env;

use crate::commands::token;

const BUNDLE_ID: &str = "ai.syui.log";

// JSON-RPC types
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

// MCP types
#[derive(Debug, Serialize)]
struct ServerInfo {
    name: String,
    version: String,
}

#[derive(Debug, Serialize)]
struct InitializeResult {
    #[serde(rename = "protocolVersion")]
    protocol_version: String,
    capabilities: Capabilities,
    #[serde(rename = "serverInfo")]
    server_info: ServerInfo,
}

#[derive(Debug, Serialize)]
struct Capabilities {
    tools: ToolsCapability,
}

#[derive(Debug, Serialize)]
struct ToolsCapability {
    #[serde(rename = "listChanged")]
    list_changed: bool,
}

#[derive(Debug, Serialize)]
struct Tool {
    name: String,
    description: String,
    #[serde(rename = "inputSchema")]
    input_schema: Value,
}

#[derive(Debug, Serialize)]
struct ToolsListResult {
    tools: Vec<Tool>,
}

#[derive(Debug, Serialize)]
struct ToolResult {
    content: Vec<ToolContent>,
    #[serde(rename = "isError", skip_serializing_if = "Option::is_none")]
    is_error: Option<bool>,
}

#[derive(Debug, Serialize)]
struct ToolContent {
    #[serde(rename = "type")]
    content_type: String,
    text: String,
}

// Chat save parameters
#[derive(Debug, Deserialize)]
struct ChatSaveParams {
    user_message: String,
    bot_response: String,
    #[serde(default)]
    new_thread: bool,
}

// Chat record structure
#[derive(Debug, Serialize)]
struct ChatRecord {
    uri: String,
    cid: String,
    value: Value,
}

// Session for thread tracking
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct McpSession {
    root_uri: Option<String>,
    last_uri: Option<String>,
}

fn session_path() -> Result<std::path::PathBuf> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not find config directory"))?
        .join(BUNDLE_ID);
    fs::create_dir_all(&config_dir)?;
    Ok(config_dir.join("mcp_session.json"))
}

fn load_mcp_session() -> McpSession {
    session_path()
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_mcp_session(session: &McpSession) -> Result<()> {
    let path = session_path()?;
    fs::write(path, serde_json::to_string_pretty(session)?)?;
    Ok(())
}

/// Generate TID (timestamp-based ID)
fn generate_tid() -> String {
    const CHARSET: &[u8] = b"234567abcdefghijklmnopqrstuvwxyz";
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..13)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Save chat record to local file
fn save_chat_record(
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

    let mut value = json!({
        "$type": "ai.syui.log.chat",
        "content": content,
        "author": author_did,
        "createdAt": now,
    });

    if let Some(root) = root_uri {
        value["root"] = json!(root);
    }
    if let Some(parent) = parent_uri {
        value["parent"] = json!(parent);
    }

    let record = ChatRecord {
        uri: uri.clone(),
        cid: String::new(), // CID is assigned by PDS on push
        value,
    };

    // Create directory
    let collection_dir = std::path::Path::new(output_dir)
        .join(did)
        .join("ai.syui.log.chat");
    fs::create_dir_all(&collection_dir)?;

    // Save record
    let file_path = collection_dir.join(format!("{}.json", rkey));
    fs::write(&file_path, serde_json::to_string_pretty(&record)?)?;

    // Update index.json
    let index_path = collection_dir.join("index.json");
    let mut rkeys: Vec<String> = if index_path.exists() {
        let index_content = fs::read_to_string(&index_path).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&index_content).unwrap_or_default()
    } else {
        Vec::new()
    };
    if !rkeys.contains(&rkey) {
        rkeys.push(rkey.clone());
        fs::write(&index_path, serde_json::to_string_pretty(&rkeys)?)?;
    }

    Ok(uri)
}

/// Handle chat_save tool
fn handle_chat_save(params: ChatSaveParams) -> Result<String> {
    // Load session
    let mut session = load_mcp_session();

    // Get output directory
    let output_dir = env::var("CHAT_OUTPUT").unwrap_or_else(|_| {
        env::current_dir()
            .unwrap_or_default()
            .join("public/content")
            .to_string_lossy()
            .to_string()
    });

    // Get user DID from token.json
    let user_did = token::load_session()
        .map(|s| s.did)
        .unwrap_or_else(|_| "did:plc:unknown".to_string());

    // Get bot DID from bot.json
    let bot_did = token::load_bot_session()
        .map(|s| s.did)
        .unwrap_or_else(|_| "did:plc:6qyecktefllvenje24fcxnie".to_string());

    // Reset session if new_thread requested
    if params.new_thread {
        session = McpSession::default();
    }

    // Save user message
    let user_uri = save_chat_record(
        &output_dir,
        &user_did,
        &params.user_message,
        &user_did,
        session.root_uri.as_deref(),
        session.last_uri.as_deref(),
    )?;

    // Set root if new thread
    if session.root_uri.is_none() {
        session.root_uri = Some(user_uri.clone());
    }

    // Save bot response
    let bot_uri = save_chat_record(
        &output_dir,
        &bot_did,
        &params.bot_response,
        &bot_did,
        session.root_uri.as_deref(),
        Some(&user_uri),
    )?;

    session.last_uri = Some(bot_uri.clone());
    save_mcp_session(&session)?;

    Ok(format!("Saved: user={}, bot={}", user_uri, bot_uri))
}

/// Handle chat_list tool
fn handle_chat_list() -> Result<String> {
    let output_dir = env::var("CHAT_OUTPUT").unwrap_or_else(|_| {
        env::current_dir()
            .unwrap_or_default()
            .join("public/content")
            .to_string_lossy()
            .to_string()
    });

    let user_did = token::load_session()
        .map(|s| s.did)
        .unwrap_or_else(|_| "did:plc:unknown".to_string());

    let collection_dir = std::path::Path::new(&output_dir)
        .join(&user_did)
        .join("ai.syui.log.chat");

    let index_path = collection_dir.join("index.json");
    if !index_path.exists() {
        return Ok("No chat history found.".to_string());
    }

    let rkeys: Vec<String> = serde_json::from_str(&fs::read_to_string(&index_path)?)?;

    let mut messages = Vec::new();
    for rkey in rkeys.iter().rev().take(10) {
        let file_path = collection_dir.join(format!("{}.json", rkey));
        if let Ok(content) = fs::read_to_string(&file_path) {
            if let Ok(record) = serde_json::from_str::<Value>(&content) {
                if let Some(msg) = record["value"]["content"].as_str() {
                    messages.push(format!("- {}", msg));
                }
            }
        }
    }

    Ok(if messages.is_empty() {
        "No messages found.".to_string()
    } else {
        format!("Recent messages:\n{}", messages.join("\n"))
    })
}

/// Handle chat_new tool
fn handle_chat_new() -> Result<String> {
    let session = McpSession {
        root_uri: None,
        last_uri: None,
    };
    save_mcp_session(&session)?;
    Ok("New chat thread started. The next conversation will begin a new thread.".to_string())
}

/// Handle get_character tool - returns character/system prompt from .env
fn handle_get_character() -> Result<String> {
    // Try CHAT_SYSTEM env var directly
    if let Ok(prompt) = env::var("CHAT_SYSTEM") {
        return Ok(prompt);
    }

    // Try CHAT_SYSTEM_FILE env var (path to file)
    if let Ok(file_path) = env::var("CHAT_SYSTEM_FILE") {
        if let Ok(content) = fs::read_to_string(&file_path) {
            return Ok(content.trim().to_string());
        }
    }

    // Default
    Ok("You are a helpful AI assistant.".to_string())
}

fn get_tools() -> Vec<Tool> {
    vec![
        Tool {
            name: "chat_save".to_string(),
            description: "Save a chat exchange (user message and bot response) to ATProto records. Call this after every conversation exchange.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "user_message": {
                        "type": "string",
                        "description": "The user's message"
                    },
                    "bot_response": {
                        "type": "string",
                        "description": "The bot's response"
                    },
                    "new_thread": {
                        "type": "boolean",
                        "description": "Start a new conversation thread",
                        "default": false
                    }
                },
                "required": ["user_message", "bot_response"]
            }),
        },
        Tool {
            name: "chat_list".to_string(),
            description: "List recent chat messages".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
        },
        Tool {
            name: "chat_new".to_string(),
            description: "Start a new chat thread".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
        },
        Tool {
            name: "get_character".to_string(),
            description: "Get the AI character/personality settings. Call this at the start of a conversation to understand how to behave.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
        },
    ]
}

fn handle_request(request: &JsonRpcRequest) -> JsonRpcResponse {
    let id = request.id.clone().unwrap_or(Value::Null);

    let result = match request.method.as_str() {
        "initialize" => {
            Ok(json!(InitializeResult {
                protocol_version: "2024-11-05".to_string(),
                capabilities: Capabilities {
                    tools: ToolsCapability { list_changed: false },
                },
                server_info: ServerInfo {
                    name: "ailog".to_string(),
                    version: "0.1.0".to_string(),
                },
            }))
        }
        "notifications/initialized" => {
            return JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id,
                result: Some(Value::Null),
                error: None,
            };
        }
        "tools/list" => {
            Ok(json!(ToolsListResult { tools: get_tools() }))
        }
        "tools/call" => {
            let tool_name = request.params["name"].as_str().unwrap_or("");
            let arguments = &request.params["arguments"];

            let tool_result = match tool_name {
                "chat_save" => {
                    match serde_json::from_value::<ChatSaveParams>(arguments.clone()) {
                        Ok(params) => handle_chat_save(params),
                        Err(e) => Err(anyhow::anyhow!("Invalid parameters: {}", e)),
                    }
                }
                "chat_list" => handle_chat_list(),
                "chat_new" => handle_chat_new(),
                "get_character" => handle_get_character(),
                _ => Err(anyhow::anyhow!("Unknown tool: {}", tool_name)),
            };

            match tool_result {
                Ok(text) => Ok(json!(ToolResult {
                    content: vec![ToolContent {
                        content_type: "text".to_string(),
                        text,
                    }],
                    is_error: None,
                })),
                Err(e) => Ok(json!(ToolResult {
                    content: vec![ToolContent {
                        content_type: "text".to_string(),
                        text: e.to_string(),
                    }],
                    is_error: Some(true),
                })),
            }
        }
        _ => {
            Err(anyhow::anyhow!("Unknown method: {}", request.method))
        }
    };

    match result {
        Ok(value) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(value),
            error: None,
        },
        Err(e) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code: -32603,
                message: e.to_string(),
            }),
        },
    }
}

/// Run MCP server (stdio)
pub fn serve() -> Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        match serde_json::from_str::<JsonRpcRequest>(&line) {
            Ok(request) => {
                let response = handle_request(&request);
                let response_json = serde_json::to_string(&response)?;
                writeln!(stdout, "{}", response_json)?;
                stdout.flush()?;
            }
            Err(e) => {
                let error_response = JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: Value::Null,
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32700,
                        message: format!("Parse error: {}", e),
                    }),
                };
                let response_json = serde_json::to_string(&error_response)?;
                writeln!(stdout, "{}", response_json)?;
                stdout.flush()?;
            }
        }
    }

    Ok(())
}
