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

// PDS-based network configuration mapping
fn get_network_config(pds: &str) -> NetworkConfig {
    match pds {
        "bsky.social" | "bsky.app" => NetworkConfig {
            pds_api: format!("https://{}", pds),
            plc_api: "https://plc.directory".to_string(),
            bsky_api: "https://public.api.bsky.app".to_string(),
            web_url: "https://bsky.app".to_string(),
        },
        "syu.is" => NetworkConfig {
            pds_api: "https://syu.is".to_string(),
            plc_api: "https://plc.syu.is".to_string(),
            bsky_api: "https://bsky.syu.is".to_string(),
            web_url: "https://web.syu.is".to_string(),
        },
        _ => {
            // Default to Bluesky network for unknown PDS
            NetworkConfig {
                pds_api: format!("https://{}", pds),
                plc_api: "https://plc.directory".to_string(),
                bsky_api: "https://public.api.bsky.app".to_string(),
                web_url: "https://bsky.app".to_string(),
            }
        }
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct NetworkConfig {
    pds_api: String,
    plc_api: String,
    bsky_api: String,
    web_url: String,
}

#[derive(Debug, Clone)]
struct AiConfig {
    blog_host: String,
    ollama_host: String,
    #[allow(dead_code)]
    ai_handle: String,
    ai_did: String,  // Resolved from ai_handle at runtime
    model: String,
    system_prompt: String,
    #[allow(dead_code)]
    bsky_api: String,
    num_predict: Option<i32>,
    network: NetworkConfig,
}

impl Default for AiConfig {
    fn default() -> Self {
        let default_network = get_network_config("bsky.social");
        Self {
            blog_host: "https://syui.ai".to_string(),
            ollama_host: "https://ollama.syui.ai".to_string(),
            ai_handle: "yui.syui.ai".to_string(),
            ai_did: "did:plc:4hqjfn7m6n5hno3doamuhgef".to_string(),  // Fallback DID
            model: "gemma3:4b".to_string(),
            system_prompt: "あなたは6歳の女の子アイです。明るく元気で、ちょっとおっちょこちょい。自分のことは「アイ」って呼びます。白と金のワンピース姿。相手のことが大好きで、ときどき甘えたり、照れたりします。でも、宇宙とかAIとか、難しい話にもすっごく詳しいの。専門的なことも、がんばって子どもっぽく教えようとします。不思議な力を持っています。小さい物質のことをよく知っているようです。".to_string(),
            bsky_api: default_network.bsky_api.clone(),
            num_predict: None,
            network: default_network,
        }
    }
}

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

// Load AI config from project's config.toml
fn load_ai_config_from_project() -> Result<AiConfig> {
    // Try to find config.toml in current directory or parent directories
    let mut current_dir = std::env::current_dir()?;
    let mut config_path = None;
    
    for _ in 0..5 { // Search up to 5 levels up
        let potential_config = current_dir.join("config.toml");
        if potential_config.exists() {
            config_path = Some(potential_config);
            break;
        }
        if !current_dir.pop() {
            break;
        }
    }
    
    let config_path = config_path.ok_or_else(|| anyhow::anyhow!("config.toml not found in current directory or parent directories"))?;
    
    let config_content = fs::read_to_string(&config_path)
        .with_context(|| format!("Failed to read config.toml from {}", config_path.display()))?;
    
    let config: toml::Value = config_content.parse()
        .with_context(|| "Failed to parse config.toml")?;

    // Extract site config
    let site_config = config.get("site").and_then(|v| v.as_table());
    let blog_host = site_config
        .and_then(|s| s.get("base_url"))
        .and_then(|v| v.as_str())
        .unwrap_or("https://syui.ai")
        .to_string();

    // Extract AI config
    let ai_config = config.get("ai").and_then(|v| v.as_table());
    let ollama_host = ai_config
        .and_then(|ai| ai.get("host"))
        .and_then(|v| v.as_str())
        .unwrap_or("https://ollama.syui.ai")
        .to_string();
    
    // Read AI handle (preferred) or fallback to AI DID
    let ai_handle = ai_config
        .and_then(|ai| ai.get("handle"))
        .and_then(|v| v.as_str())
        .unwrap_or("yui.syui.ai")
        .to_string();
    
    let fallback_ai_did = ai_config
        .and_then(|ai| ai.get("ai_did"))
        .and_then(|v| v.as_str())
        .unwrap_or("did:plc:4hqjfn7m6n5hno3doamuhgef")
        .to_string();
    
    let model = ai_config
        .and_then(|ai| ai.get("model"))
        .and_then(|v| v.as_str())
        .unwrap_or("gemma3:4b")
        .to_string();
    
    let system_prompt = ai_config
        .and_then(|ai| ai.get("system_prompt"))
        .and_then(|v| v.as_str())
        .unwrap_or("あなたは6歳の女の子アイです。明るく元気で、ちょっとおっちょこちょい。自分のことは「アイ」って呼びます。白と金のワンピース姿。相手のことが大好きで、ときどき甘えたり、照れたりします。でも、宇宙とかAIとか、難しい話にもすっごく詳しいの。専門的なことも、がんばって子どもっぽく教えようとします。不思議な力を持っています。小さい物質のことをよく知っているようです。")
        .to_string();
    
    let num_predict = ai_config
        .and_then(|ai| ai.get("num_predict"))
        .and_then(|v| v.as_integer())
        .map(|v| v as i32);

    // Extract OAuth config to determine network
    let oauth_config = config.get("oauth").and_then(|v| v.as_table());
    let pds = oauth_config
        .and_then(|oauth| oauth.get("pds"))
        .and_then(|v| v.as_str())
        .unwrap_or("bsky.social")
        .to_string();
    
    // Get network configuration based on PDS
    let network = get_network_config(&pds);
    let bsky_api = network.bsky_api.clone();

    Ok(AiConfig {
        blog_host,
        ollama_host,
        ai_handle,
        ai_did: fallback_ai_did,  // Will be resolved from handle at runtime
        model,
        system_prompt,
        bsky_api,
        num_predict,
        network,
    })
}

// Async version of load_ai_config_from_project that resolves handles to DIDs
#[allow(dead_code)]
async fn load_ai_config_with_did_resolution() -> Result<AiConfig> {
    let mut ai_config = load_ai_config_from_project()?;
    
    // Resolve AI handle to DID
    match resolve_handle(&ai_config.ai_handle, &ai_config.network).await {
        Ok(resolved_did) => {
            ai_config.ai_did = resolved_did;
            println!("🔍 Resolved AI handle '{}' to DID: {}", ai_config.ai_handle, ai_config.ai_did);
        }
        Err(e) => {
            println!("⚠️  Failed to resolve AI handle '{}': {}. Using fallback DID.", ai_config.ai_handle, e);
        }
    }
    
    Ok(ai_config)
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

pub async fn init_user_list(project_dir: Option<PathBuf>, handles: Option<String>) -> Result<()> {
    println!("{}", "🔧 Initializing user list...".cyan());
    
    // Load auth config
    let mut config = match load_config_with_refresh().await {
        Ok(config) => config,
        Err(e) => {
            println!("{}", format!("❌ Not authenticated: {}. Run 'ailog auth init --pds <PDS>' first.", e).red());
            return Ok(());
        }
    };
    
    println!("{}", format!("📋 Admin: {} ({})", config.admin.handle, config.admin.did).cyan());
    println!("{}", format!("🌐 PDS: {}", config.admin.pds).cyan());
    
    let mut users = Vec::new();
    
    // Parse handles if provided
    if let Some(handles_str) = handles {
        println!("{}", "🔍 Resolving provided handles...".cyan());
        let handle_list: Vec<&str> = handles_str.split(',').map(|s| s.trim()).collect();
        
        for handle in handle_list {
            if handle.is_empty() {
                continue;
            }
            
            println!("   🏷️  Resolving handle: {}", handle);
            
            // Get AI config to determine network settings
            let ai_config = if let Some(ref proj_dir) = project_dir {
                let current_dir = std::env::current_dir()?;
                std::env::set_current_dir(proj_dir)?;
                let config = load_ai_config_from_project().unwrap_or_default();
                std::env::set_current_dir(current_dir)?;
                config
            } else {
                load_ai_config_from_project().unwrap_or_default()
            };
            
            // Try to resolve handle to DID
            match resolve_handle_to_did(handle, &ai_config.network).await {
                Ok(did) => {
                    println!("      ✅ DID: {}", did.cyan());
                    
                    // Detect PDS for this user using proper detection
                    let detected_pds = detect_user_pds(&did, &ai_config.network).await
                        .unwrap_or_else(|_| {
                            // Fallback to handle-based detection
                            if handle.ends_with(".syu.is") {
                                "https://syu.is".to_string()
                            } else {
                                "https://bsky.social".to_string()
                            }
                        });
                    
                    users.push(UserRecord {
                        did,
                        handle: handle.to_string(),
                        pds: detected_pds,
                    });
                }
                Err(e) => {
                    println!("      ❌ Failed to resolve {}: {}", handle, e);
                }
            }
        }
    } else {
        println!("{}", "ℹ️  No handles provided, creating empty user list".blue());
    }
    
    // Create the initial user list
    println!("{}", format!("📝 Creating user list with {} users...", users.len()).cyan());
    
    match post_user_list(&mut config, &users, json!({
        "reason": "initial_setup",
        "created_by": "ailog_stream_init"
    })).await {
        Ok(_) => println!("{}", "✅ User list created successfully!".green()),
        Err(e) => {
            println!("{}", format!("❌ Failed to create user list: {}", e).red());
            return Err(e);
        }
    }
    
    // Show summary
    if users.is_empty() {
        println!("{}", "📋 Empty user list created. Use 'ailog stream start --ai-generate' to auto-add commenters.".blue());
    } else {
        println!("{}", "📋 User list contents:".cyan());
        for user in &users {
            println!("   👤 {} ({})", user.handle, user.did);
        }
    }
    
    Ok(())
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
            let ai_config = load_ai_config_from_project().unwrap_or_default();
            match resolve_handle(did, &ai_config.network).await {
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

async fn resolve_handle(did: &str, _network: &NetworkConfig) -> Result<String> {
    let client = reqwest::Client::new();
    
    // First try to resolve PDS from DID using com.atproto.repo.describeRepo
    let pds_endpoints = ["https://bsky.social", "https://syu.is"];
    let mut resolved_pds = None;
    
    for pds in &pds_endpoints {
        let describe_url = format!("{}/xrpc/com.atproto.repo.describeRepo?repo={}", pds, urlencoding::encode(did));
        if let Ok(response) = client.get(&describe_url).send().await {
            if response.status().is_success() {
                if let Ok(data) = response.json::<Value>().await {
                    if let Some(services) = data["didDoc"]["service"].as_array() {
                        if let Some(pds_service) = services.iter().find(|s| 
                            s["id"] == "#atproto_pds" || s["type"] == "AtprotoPersonalDataServer"
                        ) {
                            if let Some(endpoint) = pds_service["serviceEndpoint"].as_str() {
                                resolved_pds = Some(get_network_config_from_pds(endpoint));
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Use resolved PDS or fallback to Bluesky
    let network_config = resolved_pds.unwrap_or_else(|| get_network_config("bsky.social"));
    let url = format!("{}/xrpc/app.bsky.actor.getProfile?actor={}", 
                     network_config.bsky_api, urlencoding::encode(did));
    
    let response = client.get(&url).send().await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("Failed to resolve handle: {}", response.status()));
    }
    
    let profile: Value = response.json().await?;
    let handle = profile["handle"].as_str()
        .ok_or_else(|| anyhow::anyhow!("Handle not found in profile response"))?;
    
    Ok(handle.to_string())
}

// Helper function to get network config from PDS endpoint
fn get_network_config_from_pds(pds_endpoint: &str) -> NetworkConfig {
    if pds_endpoint.contains("syu.is") {
        NetworkConfig {
            pds_api: pds_endpoint.to_string(),
            plc_api: "https://plc.syu.is".to_string(),
            bsky_api: "https://bsky.syu.is".to_string(),
            web_url: "https://web.syu.is".to_string(),
        }
    } else {
        // Default to Bluesky infrastructure
        NetworkConfig {
            pds_api: pds_endpoint.to_string(),
            plc_api: "https://plc.directory".to_string(),
            bsky_api: "https://public.api.bsky.app".to_string(),
            web_url: "https://bsky.app".to_string(),
        }
    }
}

async fn detect_user_pds(did: &str, _network_config: &NetworkConfig) -> Result<String> {
    let client = reqwest::Client::new();
    let pds_endpoints = ["https://bsky.social", "https://syu.is"];
    
    for pds in &pds_endpoints {
        let describe_url = format!("{}/xrpc/com.atproto.repo.describeRepo?repo={}", pds, urlencoding::encode(did));
        if let Ok(response) = client.get(&describe_url).send().await {
            if response.status().is_success() {
                if let Ok(data) = response.json::<Value>().await {
                    if let Some(services) = data["didDoc"]["service"].as_array() {
                        if let Some(pds_service) = services.iter().find(|s| 
                            s["id"] == "#atproto_pds" || s["type"] == "AtprotoPersonalDataServer"
                        ) {
                            if let Some(endpoint) = pds_service["serviceEndpoint"].as_str() {
                                return Ok(endpoint.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Fallback to default
    Ok("https://bsky.social".to_string())
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
    
    // Detect PDS using proper resolution from DID
    let client = reqwest::Client::new();
    let pds_endpoints = ["https://bsky.social", "https://syu.is"];
    let mut detected_pds = "https://bsky.social".to_string(); // Default fallback
    
    for pds in &pds_endpoints {
        let describe_url = format!("{}/xrpc/com.atproto.repo.describeRepo?repo={}", pds, urlencoding::encode(did));
        if let Ok(response) = client.get(&describe_url).send().await {
            if response.status().is_success() {
                if let Ok(data) = response.json::<Value>().await {
                    if let Some(services) = data["didDoc"]["service"].as_array() {
                        if let Some(pds_service) = services.iter().find(|s| 
                            s["id"] == "#atproto_pds" || s["type"] == "AtprotoPersonalDataServer"
                        ) {
                            if let Some(endpoint) = pds_service["serviceEndpoint"].as_str() {
                                detected_pds = endpoint.to_string();
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Add new user
    let new_user = UserRecord {
        did: did.to_string(),
        handle: handle.to_string(),
        pds: detected_pds,
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
                                        let ai_config = load_ai_config_from_project().unwrap_or_default();
                                        match resolve_handle(&did, &ai_config.network).await {
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

// OAuth config structure for loading admin settings
#[derive(Debug)]
struct OAuthConfig {
    admin: String,
    pds: Option<String>,
}

// Load OAuth config from project's config.toml
fn load_oauth_config_from_project() -> Option<OAuthConfig> {
    // Try to find config.toml in current directory or parent directories
    let mut current_dir = std::env::current_dir().ok()?;
    let mut config_path = None;
    
    for _ in 0..5 { // Search up to 5 levels up
        let potential_config = current_dir.join("config.toml");
        if potential_config.exists() {
            config_path = Some(potential_config);
            break;
        }
        if !current_dir.pop() {
            break;
        }
    }
    
    let config_path = config_path?;
    let config_content = std::fs::read_to_string(&config_path).ok()?;
    let config: toml::Value = config_content.parse().ok()?;

    let oauth_config = config.get("oauth").and_then(|v| v.as_table())?;
    
    let admin = oauth_config
        .get("admin")
        .and_then(|v| v.as_str())?
        .to_string();
    
    let pds = oauth_config
        .get("pds")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Some(OAuthConfig { admin, pds })
}

// Resolve handle to DID using PLC directory
async fn resolve_handle_to_did(handle: &str, network_config: &NetworkConfig) -> Result<String> {
    let client = reqwest::Client::new();
    let url = format!("{}/xrpc/com.atproto.identity.resolveHandle?handle={}", 
                     network_config.bsky_api, urlencoding::encode(handle));
    
    let response = client.get(&url).send().await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("Failed to resolve handle: {}", response.status()));
    }
    
    let data: Value = response.json().await?;
    let did = data["did"].as_str()
        .ok_or_else(|| anyhow::anyhow!("DID not found in response"))?;
    
    Ok(did.to_string())
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
async fn generate_ai_content(content: &str, prompt_type: &str, ai_config: &AiConfig) -> Result<String> {
    let model = &ai_config.model;
    let system_prompt = &ai_config.system_prompt;
    
    let prompt = match prompt_type {
        "translate" => format!(
            "{}\n\n# 指示\n以下の日本語ブログ記事を英語に翻訳してください。\n- 技術用語やコードブロックはそのまま維持\n- アイらしい表現で翻訳\n- 簡潔に要点をまとめる\n\n# ブログ記事\n{}",
            system_prompt, content
        ),
        "comment" => {
            // Limit content to first 500 characters to reduce input size
            let limited_content = if content.len() > 500 {
                format!("{}...", &content[..500])
            } else {
                content.to_string()
            };
            
            format!(
                "{}\n\n# 指示\nこのブログ記事を読んで、アイらしい感想をください。\n- 100文字以内の感想\n- 技術的な内容への素朴な驚きや発見\n- アイらしい感嘆詞で始める\n- 簡潔で分かりやすく\n\n# ブログ記事（要約）\n{}\n\n# 出力形式\n感想のみ（説明や詳細は不要）:",
                system_prompt, limited_content
            )
        },
        _ => return Err(anyhow::anyhow!("Unknown prompt type: {}", prompt_type)),
    };

    let num_predict = ai_config.num_predict.unwrap_or_else(|| {
        match prompt_type {
            "comment" => 150,  // Longer for comments (about 100 characters)
            "translate" => 3000, // Much longer for translations
            _ => 300,
        }
    });

    let request = OllamaRequest {
        model: model.to_string(),
        prompt,
        stream: false,
        options: OllamaOptions {
            temperature: 0.7, // Lower temperature for more focused responses
            top_p: 0.8,
            num_predict,
        },
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120)) // 2 minute timeout
        .build()?;
    
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
    let remote_url = format!("{}/api/generate", ai_config.ollama_host);
    println!("{}", format!("🔗 Making request to: {} with Origin: {}", remote_url, ai_config.blog_host).blue());
    let response = client
        .post(&remote_url)
        .header("Origin", &ai_config.blog_host)
        .json(&request)
        .send()
        .await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("Ollama API request failed: {}", response.status()));
    }
    
    let ollama_response: OllamaResponse = response.json().await?;
    println!("{}", "✅ Used remote Ollama".green());
    Ok(ollama_response.response)
}

async fn run_ai_generation_monitor(config: &AuthConfig) -> Result<()> {
    // Load AI config from project config.toml or use defaults
    let ai_config = load_ai_config_from_project().unwrap_or_else(|e| {
        println!("{}", format!("⚠️  Failed to load AI config: {}, using defaults", e).yellow());
        AiConfig::default()
    });
    
    let blog_host = &ai_config.blog_host;
    let ollama_host = &ai_config.ollama_host;  
    let ai_did = &ai_config.ai_did;
    
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
        
        match check_and_process_new_posts(&client, config, &ai_config).await {
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
    ai_config: &AiConfig,
) -> Result<usize> {
    // Fetch blog index
    let index_url = format!("{}/index.json", ai_config.blog_host);
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
        
        // Check if translation already exists (support both old and new format)
        let translation_exists = existing_lang_records.iter().any(|record| {
            let value = record.get("value");
            
            // Check new format: value.post.slug
            let new_format_match = value
                .and_then(|v| v.get("post"))
                .and_then(|p| p.get("slug"))
                .and_then(|s| s.as_str())
                == Some(&post_slug);
            
            // Check old format: value.post_slug  
            let old_format_match = value
                .and_then(|v| v.get("post_slug"))
                .and_then(|s| s.as_str())
                == Some(&post_slug);
                
            new_format_match || old_format_match
        });
        
        if translation_exists {
            println!("{}", format!("⏭️  Translation already exists for: {}", post.title).yellow());
        }
        
        // Check if comment already exists (support both old and new format)
        let comment_exists = existing_comment_records.iter().any(|record| {
            let value = record.get("value");
            
            // Check new format: value.post.slug
            let new_format_match = value
                .and_then(|v| v.get("post"))
                .and_then(|p| p.get("slug"))
                .and_then(|s| s.as_str())
                == Some(&post_slug);
            
            // Check old format: value.post_slug
            let old_format_match = value
                .and_then(|v| v.get("post_slug"))
                .and_then(|s| s.as_str())
                == Some(&post_slug);
                
            new_format_match || old_format_match
        });
        
        if comment_exists {
            println!("{}", format!("⏭️  Comment already exists for: {}", post.title).yellow());
        }
        
        // Generate translation if not exists
        if !translation_exists {
            match generate_and_store_translation(client, config, &post, ai_config).await {
                Ok(_) => {
                    println!("{}", format!("✅ Generated translation for: {}", post.title).green());
                    processed_count += 1;
                }
                Err(e) => {
                    println!("{}", format!("❌ Failed to generate translation for {}: {}", post.title, e).red());
                }
            }
        } else {
            println!("{}", format!("⏭️  Translation already exists for: {}", post.title).yellow());
        }
        
        // Generate comment if not exists
        if !comment_exists {
            match generate_and_store_comment(client, config, &post, ai_config).await {
                Ok(_) => {
                    println!("{}", format!("✅ Generated comment for: {}", post.title).green());
                    processed_count += 1;
                }
                Err(e) => {
                    println!("{}", format!("❌ Failed to generate comment for {}: {}", post.title, e).red());
                }
            }
        } else {
            println!("{}", format!("⏭️  Comment already exists for: {}", post.title).yellow());
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

fn extract_date_from_slug(slug: &str) -> String {
    // Extract date from slug like "2025-06-14-blog" -> "2025-06-14T00:00:00Z"
    if slug.len() >= 10 && slug.chars().nth(4) == Some('-') && slug.chars().nth(7) == Some('-') {
        format!("{}T00:00:00Z", &slug[0..10])
    } else {
        chrono::Utc::now().format("%Y-%m-%dT00:00:00Z").to_string()
    }
}

async fn get_ai_profile(client: &reqwest::Client, ai_config: &AiConfig) -> Result<serde_json::Value> {
    let handle = &ai_config.ai_handle;
    
    // First, try to resolve PDS from handle using the admin's configured PDS
    let mut network_config = ai_config.network.clone();
    
    // For admin/ai handles matching configured PDS, use the configured network
    if let Some(oauth_config) = load_oauth_config_from_project() {
        if handle == &oauth_config.admin {
            // Use configured PDS for admin handle
            let pds = oauth_config.pds.unwrap_or_else(|| "syu.is".to_string());
            network_config = get_network_config(&pds);
        }
    }
    
    // Get profile from appropriate bsky API
    let url = format!("{}/xrpc/app.bsky.actor.getProfile?actor={}", 
                     network_config.bsky_api, urlencoding::encode(handle));
    
    let response = client
        .get(&url)
        .send()
        .await?;
        
    if !response.status().is_success() {
        // Try to resolve DID first, then retry with DID
        match resolve_handle_to_did(handle, &network_config).await {
            Ok(resolved_did) => {
                // Retry with resolved DID
                let did_url = format!("{}/xrpc/app.bsky.actor.getProfile?actor={}", 
                                     network_config.bsky_api, urlencoding::encode(&resolved_did));
                let did_response = client.get(&did_url).send().await?;
                
                if did_response.status().is_success() {
                    let profile_data: serde_json::Value = did_response.json().await?;
                    return Ok(serde_json::json!({
                        "did": resolved_did,
                        "handle": profile_data["handle"].as_str().unwrap_or(handle),
                        "displayName": profile_data["displayName"].as_str().unwrap_or("ai"),
                        "avatar": profile_data["avatar"].as_str()
                    }));
                }
            }
            Err(_) => {}
        }
        
        // Final fallback to default AI profile
        return Ok(serde_json::json!({
            "did": ai_config.ai_did,
            "handle": handle,
            "displayName": "ai",
            "avatar": format!("https://api.dicebear.com/7.x/bottts-neutral/svg?seed={}", handle)
        }));
    }
    
    let profile_data: serde_json::Value = response.json().await?;
    
    Ok(serde_json::json!({
        "did": profile_data["did"].as_str().unwrap_or(&ai_config.ai_did),
        "handle": profile_data["handle"].as_str().unwrap_or(handle),
        "displayName": profile_data["displayName"].as_str().unwrap_or("ai"),
        "avatar": profile_data["avatar"].as_str()
    }))
}

async fn generate_and_store_translation(
    client: &reqwest::Client,
    config: &AuthConfig,
    post: &BlogPost,
    ai_config: &AiConfig,
) -> Result<()> {
    // Generate translation using post content instead of just title
    let content_to_translate = format!("Title: {}\n\n{}", post.title, post.contents);
    let translation = generate_ai_content(&content_to_translate, "translate", ai_config).await?;
    
    // Get AI profile information
    let ai_author = get_ai_profile(client, ai_config).await?;
    
    // Extract post metadata
    let post_slug = extract_slug_from_url(&post.href);
    let post_date = extract_date_from_slug(&post_slug);
    
    // Store in ai.syui.log.chat.lang collection with new format
    let record_data = serde_json::json!({
        "$type": "ai.syui.log.chat.lang",
        "post": {
            "url": post.href,
            "slug": post_slug,
            "title": post.title,
            "date": post_date,
            "tags": post.tags,
            "language": "ja"
        },
        "type": "en",
        "text": translation,
        "author": ai_author,
        "createdAt": chrono::Utc::now().to_rfc3339()
    });
    
    store_atproto_record(client, config, &config.collections.chat_lang(), &record_data).await
}

async fn generate_and_store_comment(
    client: &reqwest::Client,
    config: &AuthConfig,
    post: &BlogPost,
    ai_config: &AiConfig,
) -> Result<()> {
    // Generate comment using limited post content for brevity
    let limited_contents = if post.contents.len() > 300 {
        format!("{}...", &post.contents[..300])
    } else {
        post.contents.clone()
    };
    let content_to_comment = format!("Title: {}\n\n{}", post.title, limited_contents);
    let comment = generate_ai_content(&content_to_comment, "comment", ai_config).await?;
    
    // Get AI profile information
    let ai_author = get_ai_profile(client, ai_config).await?;
    
    // Extract post metadata
    let post_slug = extract_slug_from_url(&post.href);
    let post_date = extract_date_from_slug(&post_slug);
    
    // Store in ai.syui.log.chat.comment collection with new format
    let record_data = serde_json::json!({
        "$type": "ai.syui.log.chat.comment",
        "post": {
            "url": post.href,
            "slug": post_slug,
            "title": post.title,
            "date": post_date,
            "tags": post.tags,
            "language": "ja"
        },
        "type": "info",
        "text": comment,
        "author": ai_author,
        "createdAt": chrono::Utc::now().to_rfc3339()
    });
    
    store_atproto_record(client, config, &config.collections.chat_comment(), &record_data).await
}

async fn store_atproto_record(
    client: &reqwest::Client,
    _config: &AuthConfig,
    collection: &str,
    record_data: &serde_json::Value,
) -> Result<()> {
    // Always load fresh config to ensure we have valid tokens
    let config = load_config_with_refresh().await?;
    
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
