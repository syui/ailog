use anyhow::Result;
use axum::{
    extract::{Query, State},
    http::{HeaderValue, Method, StatusCode},
    response::{Html, Json},
    routing::{get, post},
    Router,
};
use colored::Colorize;
use std::collections::HashMap;
use std::path::PathBuf;
use tower::ServiceBuilder;
use tower_http::{
    cors::{CorsLayer, Any},
    services::ServeDir,
};
use tower_sessions::{MemoryStore, SessionManagerLayer};
use tokio::net::TcpListener;

use crate::oauth::{oauth_callback_handler, oauth_session_handler, oauth_logout_handler};

pub async fn execute_with_oauth(port: u16) -> Result<()> {
    // Check if public directory exists
    if !std::path::Path::new("public").exists() {
        println!("{}", "No public directory found. Running build first...".yellow());
        crate::commands::build::execute(std::path::PathBuf::from(".")).await?;
    }

    // Create session store
    let session_store = MemoryStore::default();
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false); // Set to true in production with HTTPS

    // CORS layer
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    // Build the router
    let app = Router::new()
        // OAuth routes
        .route("/oauth/callback", get(oauth_callback_handler))
        .route("/api/oauth/session", get(oauth_session_handler))
        .route("/api/oauth/logout", post(oauth_logout_handler))
        // Static file serving
        .fallback_service(ServeDir::new("public"))
        .layer(
            ServiceBuilder::new()
                .layer(cors)
                .layer(session_layer)
        );

    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await?;
    
    println!("{}", "Starting development server with OAuth support...".green());
    println!("Serving at: {}", format!("http://{}", addr).blue().underline());
    println!("OAuth callback: {}", format!("http://{}/oauth/callback", addr).blue().underline());
    println!("Press Ctrl+C to stop\n");

    axum::serve(listener, app).await?;
    
    Ok(())
}