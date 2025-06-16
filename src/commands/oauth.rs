use anyhow::{Result, Context};
use std::path::{Path, PathBuf};
use std::fs;
use std::process::Command;
use toml::Value;
use serde_json;
use reqwest;

pub async fn build(project_dir: PathBuf) -> Result<()> {
    println!("Building OAuth app for project: {}", project_dir.display());

    // 1. Read config.toml from project directory
    let config_path = project_dir.join("config.toml");
    if !config_path.exists() {
        anyhow::bail!("config.toml not found in {}", project_dir.display());
    }

    let config_content = fs::read_to_string(&config_path)
        .with_context(|| format!("Failed to read config.toml from {}", config_path.display()))?;
    
    let config: Value = config_content.parse()
        .with_context(|| "Failed to parse config.toml")?;

    // 2. Extract [oauth] section
    let oauth_config = config.get("oauth")
        .and_then(|v| v.as_table())
        .ok_or_else(|| anyhow::anyhow!("No [oauth] section found in config.toml"))?;

    let site_config = config.get("site")
        .and_then(|v| v.as_table())
        .ok_or_else(|| anyhow::anyhow!("No [site] section found in config.toml"))?;

    // 3. Generate environment variables
    let base_url = site_config.get("base_url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("No base_url found in [site] section"))?;

    let client_id_path = oauth_config.get("json")
        .and_then(|v| v.as_str())
        .unwrap_or("client-metadata.json");

    let redirect_path = oauth_config.get("redirect")
        .and_then(|v| v.as_str())
        .unwrap_or("oauth/callback");

    // Get admin handle instead of DID
    let admin_handle = oauth_config.get("admin")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("No admin handle found in [oauth] section"))?;

    let collection_base = oauth_config.get("collection")
        .and_then(|v| v.as_str())
        .unwrap_or("ai.syui.log");

    // Get handle list for authentication restriction
    let handle_list = oauth_config.get("handle_list")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<&str>>())
        .unwrap_or_else(|| vec![]);

    // Extract AI configuration from ai config if available
    let ai_config = config.get("ai").and_then(|v| v.as_table());
    // Get AI handle from config
    let ai_handle = ai_config
        .and_then(|ai_table| ai_table.get("ai_handle"))
        .and_then(|v| v.as_str())
        .unwrap_or("yui.syui.ai");
    let ai_enabled = ai_config
        .and_then(|ai_table| ai_table.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let ai_ask_ai = ai_config
        .and_then(|ai_table| ai_table.get("ask_ai"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let ai_provider = ai_config
        .and_then(|ai_table| ai_table.get("provider"))
        .and_then(|v| v.as_str())
        .unwrap_or("ollama");
    let ai_model = ai_config
        .and_then(|ai_table| ai_table.get("model"))
        .and_then(|v| v.as_str())
        .unwrap_or("gemma3:4b");
    let ai_host = ai_config
        .and_then(|ai_table| ai_table.get("host"))
        .and_then(|v| v.as_str())
        .unwrap_or("https://ollama.syui.ai");
    let ai_system_prompt = ai_config
        .and_then(|ai_table| ai_table.get("system_prompt"))
        .and_then(|v| v.as_str())
        .unwrap_or("あなたは6歳の女の子アイです。明るく元気で、ちょっとおっちょこちょい。自分のことは「アイ」って呼びます。白と金のワンピース姿。 相手のことが大好きで、ときどき甘えたり、照れたりします。 でも、宇宙とかAIとか、難しい話にもすっごく詳しいの。専門的なことも、がんばって子どもっぽく教えようとします。不思議な力を持っています。小さい物質のことをよく知っているようです。");

    // Determine network configuration based on PDS
    let pds = oauth_config.get("pds")
        .and_then(|v| v.as_str())
        .unwrap_or("bsky.social");
    
    let (bsky_api, _atproto_api, web_url) = match pds {
        "syu.is" => (
            "https://bsky.syu.is",
            "https://syu.is",
            "https://web.syu.is"
        ),
        "bsky.social" | "bsky.app" => (
            "https://public.api.bsky.app",
            "https://bsky.social",
            "https://bsky.app"
        ),
        _ => (
            "https://public.api.bsky.app",
            "https://bsky.social",
            "https://bsky.app"
        )
    };

    // Resolve handles to DIDs using appropriate API
    println!("🔍 Resolving admin handle: {}", admin_handle);
    let admin_did = resolve_handle_to_did(admin_handle, &bsky_api).await
        .with_context(|| format!("Failed to resolve admin handle: {}", admin_handle))?;
    
    println!("🔍 Resolving AI handle: {}", ai_handle);
    let ai_did = resolve_handle_to_did(ai_handle, &bsky_api).await
        .with_context(|| format!("Failed to resolve AI handle: {}", ai_handle))?;
    
    println!("✅ Admin DID: {}", admin_did);
    println!("✅ AI DID: {}", ai_did);

    // 4. Create .env.production content with handle-based configuration
    let env_content = format!(
        r#"# Production environment variables
VITE_APP_HOST={}
VITE_OAUTH_CLIENT_ID={}/{}
VITE_OAUTH_REDIRECT_URI={}/{}

# Handle-based Configuration (DIDs resolved at runtime)
VITE_ATPROTO_PDS={}
VITE_ADMIN_HANDLE={}
VITE_AI_HANDLE={}
VITE_OAUTH_COLLECTION={}
VITE_ATPROTO_WEB_URL={}
VITE_ATPROTO_HANDLE_LIST={}

# AI Configuration
VITE_AI_ENABLED={}
VITE_AI_ASK_AI={}
VITE_AI_PROVIDER={}
VITE_AI_MODEL={}
VITE_AI_HOST={}
VITE_AI_SYSTEM_PROMPT="{}"

# DIDs (resolved from handles - for backward compatibility)
#VITE_ADMIN_DID={}
#VITE_AI_DID={}
"#,
        base_url,
        base_url, client_id_path,
        base_url, redirect_path,
        pds,
        admin_handle,
        ai_handle,
        collection_base,
        web_url,
        format!("[{}]", handle_list.iter().map(|h| format!("\"{}\"", h)).collect::<Vec<_>>().join(",")),
        ai_enabled,
        ai_ask_ai,
        ai_provider,
        ai_model,
        ai_host,
        ai_system_prompt,
        admin_did,
        ai_did
    );

    // 5. Find oauth directory (relative to current working directory)
    let oauth_dir = Path::new("oauth");
    if !oauth_dir.exists() {
        anyhow::bail!("oauth directory not found in current working directory");
    }

    let env_path = oauth_dir.join(".env.production");
    fs::write(&env_path, env_content)
        .with_context(|| format!("Failed to write .env.production to {}", env_path.display()))?;

    println!("Generated .env.production");

    // 6. Build OAuth app
    build_oauth_app(&oauth_dir).await?;

    // 7. Copy build artifacts to project directory
    copy_build_artifacts(&oauth_dir, &project_dir).await?;

    println!("OAuth app built successfully!");
    Ok(())
}

async fn build_oauth_app(oauth_dir: &Path) -> Result<()> {
    println!("Installing dependencies...");
    
    // Check if node is available
    let node_check = Command::new("node")
        .arg("--version")
        .output();
    
    if node_check.is_err() {
        anyhow::bail!("Node.js not found. Please install Node.js or ensure it's in PATH");
    }

    // Install dependencies
    let npm_install = Command::new("npm")
        .arg("install")
        .current_dir(oauth_dir)
        .status()
        .with_context(|| "Failed to run npm install")?;

    if !npm_install.success() {
        anyhow::bail!("npm install failed");
    }

    println!("Building OAuth app...");
    
    // Build the app
    let npm_build = Command::new("npm")
        .arg("run")
        .arg("build")
        .current_dir(oauth_dir)
        .status()
        .with_context(|| "Failed to run npm run build")?;

    if !npm_build.success() {
        anyhow::bail!("npm run build failed");
    }

    println!("OAuth app build completed");
    Ok(())
}

async fn copy_build_artifacts(oauth_dir: &Path, project_dir: &Path) -> Result<()> {
    let dist_dir = oauth_dir.join("dist");
    let static_dir = project_dir.join("static");
    let templates_dir = project_dir.join("templates");

    // Remove old assets
    let assets_dir = static_dir.join("assets");
    if assets_dir.exists() {
        fs::remove_dir_all(&assets_dir)
            .with_context(|| format!("Failed to remove old assets directory: {}", assets_dir.display()))?;
    }

    // Copy all files from dist to static
    copy_dir_recursive(&dist_dir, &static_dir)
        .with_context(|| "Failed to copy dist files to static directory")?;

    // Copy index.html to oauth-assets.html template
    let index_html = dist_dir.join("index.html");
    let oauth_assets = templates_dir.join("oauth-assets.html");
    
    fs::copy(&index_html, &oauth_assets)
        .with_context(|| "Failed to copy index.html to oauth-assets.html")?;

    println!("Copied build artifacts to project directory");
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if path.is_dir() {
            copy_dir_recursive(&path, &dst_path)?;
        } else {
            fs::copy(&path, &dst_path)?;
        }
    }

    Ok(())
}

// Handle-to-DID resolution with proper PDS detection
async fn resolve_handle_to_did(handle: &str, _api_base: &str) -> Result<String> {
    let client = reqwest::Client::new();
    
    // First, try to resolve handle to DID using multiple endpoints
    let bsky_endpoints = ["https://public.api.bsky.app", "https://bsky.syu.is"];
    let mut resolved_did = None;
    
    for endpoint in &bsky_endpoints {
        let url = format!("{}/xrpc/app.bsky.actor.getProfile?actor={}", 
                         endpoint, urlencoding::encode(handle));
        
        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                if let Ok(profile) = response.json::<serde_json::Value>().await {
                    if let Some(did) = profile["did"].as_str() {
                        resolved_did = Some(did.to_string());
                        break;
                    }
                }
            }
        }
    }
    
    let did = resolved_did
        .ok_or_else(|| anyhow::anyhow!("Failed to resolve handle '{}' from any endpoint", handle))?;
    
    // Now verify the DID and get actual PDS using com.atproto.repo.describeRepo
    let pds_endpoints = ["https://bsky.social", "https://syu.is"];
    
    for pds in &pds_endpoints {
        let describe_url = format!("{}/xrpc/com.atproto.repo.describeRepo?repo={}", 
                                 pds, urlencoding::encode(&did));
        
        if let Ok(response) = client.get(&describe_url).send().await {
            if response.status().is_success() {
                if let Ok(data) = response.json::<serde_json::Value>().await {
                    if let Some(services) = data["didDoc"]["service"].as_array() {
                        if services.iter().any(|s| 
                            s["id"] == "#atproto_pds" || s["type"] == "AtprotoPersonalDataServer"
                        ) {
                            // DID is valid and has PDS service
                            println!("✅ Verified DID {} has PDS via {}", did, pds);
                            return Ok(did);
                        }
                    }
                }
            }
        }
    }
    
    // If PDS verification fails, still return the DID but warn
    println!("⚠️  Could not verify PDS for DID {}, but proceeding...", did);
    Ok(did)
}