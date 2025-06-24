use anyhow::Result;
use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
};
use axum_extra::{
    headers::{authorization::Bearer, Authorization},
    TypedHeader,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
// Removed unused import

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub question: String,
    #[serde(rename = "systemPrompt")]
    pub system_prompt: String,
    #[serde(default)]
    pub context: Value,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub answer: String,
}

#[derive(Clone)]
pub struct ClaudeProxyState {
    pub api_token: String,
    pub claude_code_path: String,
}

pub async fn claude_chat_handler(
    State(state): State<crate::mcp::server::AppState>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Json(request): Json<ChatRequest>,
) -> Result<Json<ChatResponse>, StatusCode> {
    // Claude proxyが有効かチェック
    let claude_proxy = state.claude_proxy.as_ref().ok_or(StatusCode::NOT_FOUND)?;
    
    // 認証チェック
    let auth = auth.ok_or(StatusCode::UNAUTHORIZED)?;
    if auth.token() != claude_proxy.api_token {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Claude CodeのMCP通信実装
    let response = communicate_with_claude_mcp(
        &request.question,
        &request.system_prompt,
        &request.context,
        &claude_proxy.claude_code_path,
    ).await?;

    Ok(Json(ChatResponse { answer: response }))
}

async fn communicate_with_claude_mcp(
    message: &str,
    system: &str,
    _context: &Value,
    claude_code_path: &str,
) -> Result<String, StatusCode> {
    tracing::info!("Communicating with Claude Code via stdio");
    tracing::info!("Message: {}", message);
    tracing::info!("System prompt: {}", system);
    
    // Claude Code MCPプロセスを起動
    // Use the full path to avoid shell function and don't use --continue
    let claude_executable = if claude_code_path == "claude" {
        "/Users/syui/.claude/local/claude"
    } else {
        claude_code_path
    };
    
    let mut child = tokio::process::Command::new(claude_executable)
        .args(&["--print", "--output-format", "text"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            tracing::error!("Failed to start Claude Code process: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    
    // プロンプトを構築
    let full_prompt = if !system.is_empty() {
        format!("{}\n\nUser: {}", system, message)
    } else {
        message.to_string()
    };
    
    // 標準入力にプロンプトを送信
    if let Some(stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        let mut stdin = stdin;
        stdin.write_all(full_prompt.as_bytes()).await.map_err(|e| {
            tracing::error!("Failed to write to Claude Code stdin: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        stdin.shutdown().await.map_err(|e| {
            tracing::error!("Failed to close Claude Code stdin: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }
    
    // プロセス完了を待機（タイムアウト付き）
    let output = tokio::time::timeout(
        tokio::time::Duration::from_secs(30),
        child.wait_with_output()
    )
    .await
    .map_err(|_| {
        tracing::error!("Claude Code process timed out");
        StatusCode::REQUEST_TIMEOUT
    })?
    .map_err(|e| {
        tracing::error!("Claude Code process failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    
    // プロセス終了ステータスをチェック
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::error!("Claude Code process failed with stderr: {}", stderr);
        return Ok("Claude Codeプロセスでエラーが発生しました".to_string());
    }
    
    // 標準出力を解析
    let stdout = String::from_utf8_lossy(&output.stdout);
    tracing::debug!("Claude Code stdout: {}", stdout);
    
    // Claude Codeは通常プレーンテキストを返すので、そのまま返す
    Ok(stdout.trim().to_string())
}

pub async fn claude_tools_handler() -> Json<Value> {
    Json(json!({
        "tools": {
            "chat": {
                "description": "Chat with Claude",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "message": {"type": "string"},
                        "system": {"type": "string"}
                    },
                    "required": ["message"]
                }
            }
        }
    }))
}