use anyhow::{Result, Context};
use colored::Colorize;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub admin: AdminConfig,
    pub jetstream: JetstreamConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminConfig {
    pub did: String,
    pub handle: String,
    pub access_jwt: String,
    pub refresh_jwt: String,
    pub pds: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JetstreamConfig {
    pub url: String,
    pub collections: Vec<String>,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            admin: AdminConfig {
                did: String::new(),
                handle: String::new(),
                access_jwt: String::new(),
                refresh_jwt: String::new(),
                pds: "https://bsky.social".to_string(),
            },
            jetstream: JetstreamConfig {
                url: "wss://jetstream2.us-east.bsky.network/subscribe".to_string(),
                collections: vec!["ai.syui.log".to_string()],
            },
        }
    }
}

fn get_config_path() -> Result<PathBuf> {
    let home = std::env::var("HOME").context("HOME environment variable not set")?;
    let config_dir = PathBuf::from(home).join(".config").join("syui").join("ai").join("log");
    
    // Create directory if it doesn't exist
    fs::create_dir_all(&config_dir)?;
    
    Ok(config_dir.join("config.json"))
}

pub async fn init() -> Result<()> {
    println!("{}", "🔐 Initializing ATProto authentication...".cyan());
    
    let config_path = get_config_path()?;
    
    if config_path.exists() {
        println!("{}", "⚠️  Configuration already exists. Use 'ailog auth logout' to reset.".yellow());
        return Ok(());
    }
    
    println!("{}", "📋 Please provide your ATProto credentials:".cyan());
    
    // Get user input
    print!("Handle (e.g., your.handle.bsky.social): ");
    std::io::Write::flush(&mut std::io::stdout())?;
    let mut handle = String::new();
    std::io::stdin().read_line(&mut handle)?;
    let handle = handle.trim().to_string();
    
    print!("Access JWT: ");
    std::io::Write::flush(&mut std::io::stdout())?;
    let mut access_jwt = String::new();
    std::io::stdin().read_line(&mut access_jwt)?;
    let access_jwt = access_jwt.trim().to_string();
    
    print!("Refresh JWT: ");
    std::io::Write::flush(&mut std::io::stdout())?;
    let mut refresh_jwt = String::new();
    std::io::stdin().read_line(&mut refresh_jwt)?;
    let refresh_jwt = refresh_jwt.trim().to_string();
    
    // Resolve DID from handle
    println!("{}", "🔍 Resolving DID from handle...".cyan());
    let did = resolve_did(&handle).await?;
    
    // Create config
    let config = AuthConfig {
        admin: AdminConfig {
            did: did.clone(),
            handle: handle.clone(),
            access_jwt,
            refresh_jwt,
            pds: if handle.ends_with(".syu.is") {
                "https://syu.is".to_string()
            } else {
                "https://bsky.social".to_string()
            },
        },
        jetstream: JetstreamConfig {
            url: "wss://jetstream2.us-east.bsky.network/subscribe".to_string(),
            collections: vec!["ai.syui.log".to_string()],
        },
    };
    
    // Save config
    let config_json = serde_json::to_string_pretty(&config)?;
    fs::write(&config_path, config_json)?;
    
    println!("{}", "✅ Authentication configured successfully!".green());
    println!("📁 Config saved to: {}", config_path.display());
    println!("👤 Authenticated as: {} ({})", handle, did);
    
    Ok(())
}

async fn resolve_did(handle: &str) -> Result<String> {
    let client = reqwest::Client::new();
    let url = format!("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={}", 
                     urlencoding::encode(handle));
    
    let response = client.get(&url).send().await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("Failed to resolve handle: {}", response.status()));
    }
    
    let profile: serde_json::Value = response.json().await?;
    let did = profile["did"].as_str()
        .ok_or_else(|| anyhow::anyhow!("DID not found in profile response"))?;
    
    Ok(did.to_string())
}

pub async fn status() -> Result<()> {
    let config_path = get_config_path()?;
    
    if !config_path.exists() {
        println!("{}", "❌ Not authenticated. Run 'ailog auth init' first.".red());
        return Ok(());
    }
    
    let config_json = fs::read_to_string(&config_path)?;
    let config: AuthConfig = serde_json::from_str(&config_json)?;
    
    println!("{}", "🔐 Authentication Status".cyan().bold());
    println!("─────────────────────────");
    println!("📁 Config: {}", config_path.display());
    println!("👤 Handle: {}", config.admin.handle.green());
    println!("🆔 DID: {}", config.admin.did);
    println!("🌐 PDS: {}", config.admin.pds);
    println!("📡 Jetstream: {}", config.jetstream.url);
    println!("📂 Collections: {}", config.jetstream.collections.join(", "));
    
    // Test API access
    println!("\n{}", "🧪 Testing API access...".cyan());
    match test_api_access(&config).await {
        Ok(_) => println!("{}", "✅ API access successful".green()),
        Err(e) => println!("{}", format!("❌ API access failed: {}", e).red()),
    }
    
    Ok(())
}

async fn test_api_access(config: &AuthConfig) -> Result<()> {
    let client = reqwest::Client::new();
    let url = format!("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={}", 
                     urlencoding::encode(&config.admin.handle));
    
    let response = client.get(&url).send().await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("API request failed: {}", response.status()));
    }
    
    Ok(())
}

pub async fn logout() -> Result<()> {
    let config_path = get_config_path()?;
    
    if !config_path.exists() {
        println!("{}", "ℹ️  Already logged out.".blue());
        return Ok(());
    }
    
    println!("{}", "🔓 Logging out...".cyan());
    
    // Remove config file
    fs::remove_file(&config_path)?;
    
    println!("{}", "✅ Logged out successfully!".green());
    println!("🗑️  Configuration removed from: {}", config_path.display());
    
    Ok(())
}

// Load config helper function for other modules
pub fn load_config() -> Result<AuthConfig> {
    let config_path = get_config_path()?;
    
    if !config_path.exists() {
        return Err(anyhow::anyhow!("Not authenticated. Run 'ailog auth init' first."));
    }
    
    let config_json = fs::read_to_string(&config_path)?;
    let config: AuthConfig = serde_json::from_str(&config_json)?;
    
    Ok(config)
}

// Load config with automatic token refresh
pub async fn load_config_with_refresh() -> Result<AuthConfig> {
    let mut config = load_config()?;
    
    // Test if current access token is still valid
    if let Err(_) = test_api_access_with_auth(&config).await {
        println!("{}", "🔄 Access token expired, refreshing...".yellow());
        
        // Try to refresh the token
        match refresh_access_token(&mut config).await {
            Ok(_) => {
                save_config(&config)?;
                println!("{}", "✅ Token refreshed successfully".green());
            }
            Err(e) => {
                return Err(anyhow::anyhow!("Failed to refresh token: {}. Please run 'ailog auth init' again.", e));
            }
        }
    }
    
    Ok(config)
}

async fn test_api_access_with_auth(config: &AuthConfig) -> Result<()> {
    let client = reqwest::Client::new();
    let url = format!("{}/xrpc/com.atproto.repo.listRecords?repo={}&collection=ai.syui.log&limit=1",
                     config.admin.pds,
                     urlencoding::encode(&config.admin.did));
    
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.admin.access_jwt))
        .send()
        .await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("API request failed: {}", response.status()));
    }
    
    Ok(())
}

async fn refresh_access_token(config: &mut AuthConfig) -> Result<()> {
    let client = reqwest::Client::new();
    let url = format!("{}/xrpc/com.atproto.server.refreshSession", config.admin.pds);
    
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.admin.refresh_jwt))
        .send()
        .await?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await?;
        return Err(anyhow::anyhow!("Token refresh failed: {} - {}", status, error_text));
    }
    
    let refresh_response: serde_json::Value = response.json().await?;
    
    // Update tokens
    if let Some(access_jwt) = refresh_response["accessJwt"].as_str() {
        config.admin.access_jwt = access_jwt.to_string();
    }
    
    if let Some(refresh_jwt) = refresh_response["refreshJwt"].as_str() {
        config.admin.refresh_jwt = refresh_jwt.to_string();
    }
    
    Ok(())
}

fn save_config(config: &AuthConfig) -> Result<()> {
    let config_path = get_config_path()?;
    let config_json = serde_json::to_string_pretty(config)?;
    fs::write(&config_path, config_json)?;
    Ok(())
}