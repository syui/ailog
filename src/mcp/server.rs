use anyhow::Result;
use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use crate::mcp::tools::BlogTools;
use crate::mcp::types::{McpRequest, McpResponse, McpError, CreatePostRequest, ListPostsRequest, BuildRequest};
use crate::mcp::claude_proxy::{claude_chat_handler, claude_tools_handler, ClaudeProxyState};

#[derive(Clone)]
pub struct AppState {
    pub blog_tools: Arc<BlogTools>,
    pub claude_proxy: Option<Arc<ClaudeProxyState>>,
}

pub struct McpServer {
    app_state: AppState,
}

impl McpServer {
    pub fn new(base_path: PathBuf) -> Self {
        let blog_tools = Arc::new(BlogTools::new(base_path));
        let app_state = AppState { 
            blog_tools,
            claude_proxy: None,
        };
        
        Self { app_state }
    }

    pub fn with_claude_proxy(mut self, api_token: String, claude_code_path: Option<String>) -> Self {
        let claude_code_path = claude_code_path.unwrap_or_else(|| "claude".to_string());
        self.app_state.claude_proxy = Some(Arc::new(ClaudeProxyState { 
            api_token,
            claude_code_path,
        }));
        self
    }

    pub fn create_router(&self) -> Router {
        Router::new()
            .route("/", get(root_handler))
            .route("/mcp/tools/list", get(list_tools))
            .route("/mcp/tools/call", post(call_tool))
            .route("/health", get(health_check))
            .route("/api/claude-mcp", post(claude_chat_handler))
            .route("/claude/tools", get(claude_tools_handler))
            .layer(CorsLayer::permissive())
            .with_state(self.app_state.clone())
    }

    pub async fn serve(&self, port: u16) -> Result<()> {
        let app = self.create_router();
        
        let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
        println!("ai.log MCP Server listening on port {}", port);
        
        axum::serve(listener, app).await?;
        Ok(())
    }
}

async fn root_handler() -> Json<Value> {
    Json(json!({
        "name": "ai.log MCP Server",
        "version": "0.1.0",
        "description": "AI-powered static blog generator with MCP integration",
        "tools": ["create_blog_post", "list_blog_posts", "build_blog", "get_post_content"]
    }))
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

async fn list_tools() -> Json<Value> {
    let tools = BlogTools::get_tools();
    Json(json!({
        "tools": tools
    }))
}

async fn call_tool(
    State(state): State<AppState>,
    Json(request): Json<McpRequest>,
) -> Result<Json<McpResponse>, StatusCode> {
    let tool_name = request.params
        .as_ref()
        .and_then(|p| p.get("name"))
        .and_then(|v| v.as_str())
        .ok_or(StatusCode::BAD_REQUEST)?;
    
    let arguments = request.params
        .as_ref()
        .and_then(|p| p.get("arguments"))
        .cloned()
        .unwrap_or(json!({}));

    let result = match tool_name {
        "create_blog_post" => {
            let req: CreatePostRequest = serde_json::from_value(arguments)
                .map_err(|_| StatusCode::BAD_REQUEST)?;
            state.blog_tools.create_post(req).await
        }
        "list_blog_posts" => {
            let req: ListPostsRequest = serde_json::from_value(arguments)
                .map_err(|_| StatusCode::BAD_REQUEST)?;
            state.blog_tools.list_posts(req).await
        }
        "build_blog" => {
            let req: BuildRequest = serde_json::from_value(arguments)
                .map_err(|_| StatusCode::BAD_REQUEST)?;
            state.blog_tools.build_blog(req).await
        }
        "get_post_content" => {
            let slug = arguments.get("slug")
                .and_then(|v| v.as_str())
                .ok_or(StatusCode::BAD_REQUEST)?;
            state.blog_tools.get_post_content(slug).await
        }
        "translate_document" => {
            state.blog_tools.translate_document(arguments).await
        }
        "generate_documentation" => {
            state.blog_tools.generate_documentation(arguments).await
        }
        _ => {
            return Ok(Json(McpResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id,
                result: None,
                error: Some(McpError {
                    code: -32601,
                    message: format!("Method not found: {}", tool_name),
                    data: None,
                }),
            }));
        }
    };

    match result {
        Ok(tool_result) => Ok(Json(McpResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: Some(serde_json::to_value(tool_result).unwrap()),
            error: None,
        })),
        Err(e) => Ok(Json(McpResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: None,
            error: Some(McpError {
                code: -32000,
                message: e.to_string(),
                data: None,
            }),
        })),
    }
}