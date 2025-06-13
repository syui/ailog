use anyhow::{Result, Context};
use std::path::{Path, PathBuf};
use std::fs;
use std::process::Command;
use toml::Value;

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

    let admin_did = oauth_config.get("admin")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("No admin DID found in [oauth] section"))?;

    let collection_comment = oauth_config.get("collection_comment")
        .and_then(|v| v.as_str())
        .unwrap_or("ai.syui.log");

    let collection_user = oauth_config.get("collection_user")
        .and_then(|v| v.as_str())
        .unwrap_or("ai.syui.log.user");

    let collection_chat = oauth_config.get("collection_chat")
        .and_then(|v| v.as_str())
        .unwrap_or("ai.syui.log.chat");

    // Extract AI config if present
    let ai_config = config.get("ai")
        .and_then(|v| v.as_table());
    
    let ai_enabled = ai_config
        .and_then(|ai| ai.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    let ai_ask_ai = ai_config
        .and_then(|ai| ai.get("ask_ai"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    let ai_provider = ai_config
        .and_then(|ai| ai.get("provider"))
        .and_then(|v| v.as_str())
        .unwrap_or("ollama");
    
    let ai_model = ai_config
        .and_then(|ai| ai.get("model"))
        .and_then(|v| v.as_str())
        .unwrap_or("gemma2:2b");
    
    let ai_host = ai_config
        .and_then(|ai| ai.get("host"))
        .and_then(|v| v.as_str())
        .unwrap_or("https://ollama.syui.ai");
    
    let ai_system_prompt = ai_config
        .and_then(|ai| ai.get("system_prompt"))
        .and_then(|v| v.as_str())
        .unwrap_or("you are a helpful ai assistant");
    
    let ai_did = ai_config
        .and_then(|ai| ai.get("ai_did"))
        .and_then(|v| v.as_str())
        .unwrap_or("did:plc:4hqjfn7m6n5hno3doamuhgef");

    // Extract bsky_api from oauth config
    let bsky_api = oauth_config.get("bsky_api")
        .and_then(|v| v.as_str())
        .unwrap_or("https://public.api.bsky.app");

    // 4. Create .env.production content
    let env_content = format!(
        r#"# Production environment variables
VITE_APP_HOST={}
VITE_OAUTH_CLIENT_ID={}/{}
VITE_OAUTH_REDIRECT_URI={}/{}
VITE_ADMIN_DID={}

# Collection names for OAuth app
VITE_COLLECTION_COMMENT={}
VITE_COLLECTION_USER={}
VITE_COLLECTION_CHAT={}

# Collection names for ailog (backward compatibility)
AILOG_COLLECTION_COMMENT={}
AILOG_COLLECTION_USER={}
AILOG_COLLECTION_CHAT={}

# AI Configuration
VITE_AI_ENABLED={}
VITE_AI_ASK_AI={}
VITE_AI_PROVIDER={}
VITE_AI_MODEL={}
VITE_AI_HOST={}
VITE_AI_SYSTEM_PROMPT="{}"
VITE_AI_DID={}

# API Configuration
VITE_BSKY_PUBLIC_API={}
"#,
        base_url,
        base_url, client_id_path,
        base_url, redirect_path,
        admin_did,
        collection_comment,
        collection_user,
        collection_chat,
        collection_comment,
        collection_user,
        collection_chat,
        ai_enabled,
        ai_ask_ai,
        ai_provider,
        ai_model,
        ai_host,
        ai_system_prompt,
        ai_did,
        bsky_api
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