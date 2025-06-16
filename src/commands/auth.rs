use anyhow::{Result, Context};
use colored::Colorize;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub admin: AdminConfig,
    pub jetstream: JetstreamConfig,
    pub collections: CollectionConfig,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionConfig {
    pub base: String,  // Base collection name like "ai.syui.log"
}

impl CollectionConfig {
    // Collection name builders
    pub fn comment(&self) -> String {
        self.base.clone()
    }
    
    pub fn user(&self) -> String {
        format!("{}.user", self.base)
    }
    
    #[allow(dead_code)]
    pub fn chat(&self) -> String {
        format!("{}.chat", self.base)
    }
    
    pub fn chat_lang(&self) -> String {
        format!("{}.chat.lang", self.base)
    }
    
    pub fn chat_comment(&self) -> String {
        format!("{}.chat.comment", self.base)
    }
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
            collections: CollectionConfig {
                base: "ai.syui.log".to_string(),
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
    init_with_pds(None).await
}

pub async fn init_with_options(
    pds_override: Option<String>,
    handle_override: Option<String>, 
    use_password: bool,
    access_jwt_override: Option<String>,
    refresh_jwt_override: Option<String>
) -> Result<()> {
    println!("{}", "🔐 Initializing ATProto authentication...".cyan());
    
    let config_path = get_config_path()?;
    
    if config_path.exists() {
        println!("{}", "⚠️  Configuration already exists. Use 'ailog auth logout' to reset.".yellow());
        return Ok(());
    }
    
    // Validate options
    if let (Some(_), Some(_)) = (&access_jwt_override, &refresh_jwt_override) {
        if use_password {
            println!("{}", "⚠️  Cannot use both --password and JWT tokens. Choose one method.".yellow());
            return Ok(());
        }
    } else if access_jwt_override.is_some() || refresh_jwt_override.is_some() {
        println!("{}", "❌ Both --access-jwt and --refresh-jwt must be provided together.".red());
        return Ok(());
    }
    
    println!("{}", "📋 Please provide your ATProto credentials:".cyan());
    
    // Get handle
    let handle = if let Some(h) = handle_override {
        h
    } else {
        print!("Handle (e.g., your.handle.bsky.social): ");
        std::io::Write::flush(&mut std::io::stdout())?;
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        input.trim().to_string()
    };
    
    // Determine PDS URL
    let pds_url = if let Some(override_pds) = pds_override {
        if override_pds.starts_with("http") {
            override_pds
        } else {
            format!("https://{}", override_pds)
        }
    } else {
        if handle.ends_with(".syu.is") {
            "https://syu.is".to_string()
        } else {
            "https://bsky.social".to_string()
        }
    };
    
    println!("{}", format!("🌐 Using PDS: {}", pds_url).cyan());
    
    // Get credentials
    let (access_jwt, refresh_jwt) = if let (Some(access), Some(refresh)) = (access_jwt_override, refresh_jwt_override) {
        println!("{}", "🔑 Using provided JWT tokens".cyan());
        (access, refresh)
    } else if use_password {
        println!("{}", "🔒 Using password authentication".cyan());
        authenticate_with_password(&handle, &pds_url).await?
    } else {
        // Interactive JWT input (legacy behavior)
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
        
        (access_jwt, refresh_jwt)
    };
    
    // Resolve DID from handle
    println!("{}", "🔍 Resolving DID from handle...".cyan());
    let did = resolve_did_with_pds(&handle, &pds_url).await?;
    
    // Create config
    let config = AuthConfig {
        admin: AdminConfig {
            did: did.clone(),
            handle: handle.clone(),
            access_jwt,
            refresh_jwt,
            pds: pds_url,
        },
        jetstream: JetstreamConfig {
            url: "wss://jetstream2.us-east.bsky.network/subscribe".to_string(),
            collections: vec!["ai.syui.log".to_string()],
        },
        collections: generate_collection_config(),
    };
    
    // Save config
    let config_json = serde_json::to_string_pretty(&config)?;
    fs::write(&config_path, config_json)?;
    
    println!("{}", "✅ Authentication configured successfully!".green());
    println!("📁 Config saved to: {}", config_path.display());
    println!("👤 Authenticated as: {} ({})", handle, did);
    
    Ok(())
}

pub async fn init_with_pds(pds_override: Option<String>) -> Result<()> {
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
    
    // Determine PDS URL
    let pds_url = if let Some(override_pds) = pds_override {
        // Use provided PDS override
        if override_pds.starts_with("http") {
            override_pds
        } else {
            format!("https://{}", override_pds)
        }
    } else {
        // Auto-detect from handle suffix
        if handle.ends_with(".syu.is") {
            "https://syu.is".to_string()
        } else {
            "https://bsky.social".to_string()
        }
    };
    
    println!("{}", format!("🌐 Using PDS: {}", pds_url).cyan());
    
    // Resolve DID from handle
    println!("{}", "🔍 Resolving DID from handle...".cyan());
    let did = resolve_did_with_pds(&handle, &pds_url).await?;
    
    // Create config
    let config = AuthConfig {
        admin: AdminConfig {
            did: did.clone(),
            handle: handle.clone(),
            access_jwt,
            refresh_jwt,
            pds: pds_url,
        },
        jetstream: JetstreamConfig {
            url: "wss://jetstream2.us-east.bsky.network/subscribe".to_string(),
            collections: vec!["ai.syui.log".to_string()],
        },
        collections: generate_collection_config(),
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
    
    // Use appropriate API based on handle domain
    let api_base = if handle.ends_with(".syu.is") {
        "https://bsky.syu.is"
    } else {
        "https://public.api.bsky.app"
    };
    
    let url = format!("{}/xrpc/app.bsky.actor.getProfile?actor={}", 
                     api_base, urlencoding::encode(handle));
    
    let response = client.get(&url).send().await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("Failed to resolve handle: {}", response.status()));
    }
    
    let profile: serde_json::Value = response.json().await?;
    let did = profile["did"].as_str()
        .ok_or_else(|| anyhow::anyhow!("DID not found in profile response"))?;
    
    Ok(did.to_string())
}

async fn resolve_did_with_pds(handle: &str, pds_url: &str) -> Result<String> {
    let client = reqwest::Client::new();
    
    // Try to use the PDS API first
    let api_base = if pds_url.contains("syu.is") {
        "https://bsky.syu.is"
    } else if pds_url.contains("bsky.social") {
        "https://public.api.bsky.app"
    } else {
        // For custom PDS, try to construct API URL
        pds_url
    };
    
    let url = format!("{}/xrpc/app.bsky.actor.getProfile?actor={}", 
                     api_base, urlencoding::encode(handle));
    
    let response = client.get(&url).send().await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("Failed to resolve handle using PDS {}: {}", pds_url, response.status()));
    }
    
    let profile: serde_json::Value = response.json().await?;
    let did = profile["did"].as_str()
        .ok_or_else(|| anyhow::anyhow!("DID not found in profile response"))?;
    
    Ok(did.to_string())
}

async fn authenticate_with_password(handle: &str, pds_url: &str) -> Result<(String, String)> {
    use std::io::{self, Write};
    
    // Get password securely
    print!("Password: ");
    io::stdout().flush()?;
    let password = rpassword::read_password()
        .context("Failed to read password")?;
    
    if password.is_empty() {
        return Err(anyhow::anyhow!("Password cannot be empty"));
    }
    
    println!("{}", "🔐 Authenticating with ATProto server...".cyan());
    
    let client = reqwest::Client::new();
    let auth_url = format!("{}/xrpc/com.atproto.server.createSession", pds_url);
    
    let auth_request = serde_json::json!({
        "identifier": handle,
        "password": password
    });
    
    let response = client
        .post(&auth_url)
        .header("Content-Type", "application/json")
        .json(&auth_request)
        .send()
        .await?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        
        if status.as_u16() == 401 {
            return Err(anyhow::anyhow!("Authentication failed: Invalid handle or password"));
        } else if status.as_u16() == 400 {
            return Err(anyhow::anyhow!("Authentication failed: Bad request (check handle format)"));
        } else {
            return Err(anyhow::anyhow!("Authentication failed: {} - {}", status, error_text));
        }
    }
    
    let auth_response: serde_json::Value = response.json().await?;
    
    let access_jwt = auth_response["accessJwt"].as_str()
        .ok_or_else(|| anyhow::anyhow!("No access JWT in response"))?
        .to_string();
        
    let refresh_jwt = auth_response["refreshJwt"].as_str()
        .ok_or_else(|| anyhow::anyhow!("No refresh JWT in response"))?
        .to_string();
    
    println!("{}", "✅ Password authentication successful".green());
    
    Ok((access_jwt, refresh_jwt))
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
    match test_api_access_with_auth(&config).await {
        Ok(_) => println!("{}", "✅ API access successful".green()),
        Err(e) => {
            println!("{}", format!("❌ Authenticated API access failed: {}", e).red());
            // Fallback to public API test
            println!("{}", "🔄 Trying public API access...".cyan());
            match test_api_access(&config).await {
                Ok(_) => println!("{}", "✅ Public API access successful".green()),
                Err(e2) => println!("{}", format!("❌ Public API access also failed: {}", e2).red()),
            }
        }
    }
    
    Ok(())
}

async fn test_api_access(config: &AuthConfig) -> Result<()> {
    let client = reqwest::Client::new();
    
    // Use appropriate API based on handle domain
    let api_base = if config.admin.handle.ends_with(".syu.is") {
        "https://bsky.syu.is"
    } else {
        "https://public.api.bsky.app"
    };
    
    let url = format!("{}/xrpc/app.bsky.actor.getProfile?actor={}", 
                     api_base, urlencoding::encode(&config.admin.handle));
    
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
    
    // Try to load as new format first, then migrate if needed
    match serde_json::from_str::<AuthConfig>(&config_json) {
        Ok(mut config) => {
            // Update collection configuration
            update_config_collections(&mut config);
            Ok(config)
        }
        Err(e) => {
            println!("{}", format!("Parse error: {}, attempting migration...", e).yellow());
            // Try to migrate from old format
            migrate_config_if_needed(&config_path, &config_json)
        }
    }
}

fn migrate_config_if_needed(config_path: &std::path::Path, config_json: &str) -> Result<AuthConfig> {
    // Try to parse as old format and migrate to new simple format
    let mut old_config: serde_json::Value = serde_json::from_str(config_json)?;
    
    // Migrate old collections structure to new base-only structure
    if let Some(collections) = old_config.get_mut("collections") {
        // Extract base collection name from comment field or use default
        let base_collection = collections.get("comment")
            .and_then(|v| v.as_str())
            .unwrap_or("ai.syui.log")
            .to_string();
        
        // Replace entire collections structure with new format
        old_config["collections"] = serde_json::json!({
            "base": base_collection
        });
    }
    
    // Save migrated config
    let migrated_config_json = serde_json::to_string_pretty(&old_config)?;
    fs::write(config_path, migrated_config_json)?;
    
    // Parse as new format
    let mut config: AuthConfig = serde_json::from_value(old_config)?;
    update_config_collections(&mut config);
    
    println!("{}", "✅ Configuration migrated to new simplified format".green());
    
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
    
    // Update collection configuration
    update_config_collections(&mut config);
    
    Ok(config)
}

async fn test_api_access_with_auth(config: &AuthConfig) -> Result<()> {
    let client = reqwest::Client::new();
    let url = format!("{}/xrpc/com.atproto.repo.listRecords?repo={}&collection={}&limit=1",
                     config.admin.pds,
                     urlencoding::encode(&config.admin.did),
                     urlencoding::encode(&config.collections.comment()));
    
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

// Generate collection config from environment
fn generate_collection_config() -> CollectionConfig {
    // Use VITE_OAUTH_COLLECTION for unified configuration
    let base = std::env::var("VITE_OAUTH_COLLECTION")
        .unwrap_or_else(|_| "ai.syui.log".to_string());
    
    CollectionConfig {
        base,
    }
}

// Update existing config with collection settings
pub fn update_config_collections(config: &mut AuthConfig) {
    config.collections = generate_collection_config();
    // Also update jetstream collections to monitor the comment collection
    config.jetstream.collections = vec![config.collections.comment()];
}