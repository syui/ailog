use anyhow::Result;
use colored::Colorize;
use std::path::PathBuf;
use std::fs;
use crate::generator::Generator;
use crate::config::Config;

pub async fn execute(path: PathBuf) -> Result<()> {
    println!("{}", "Building blog...".green());

    // Load configuration
    let config = Config::load(&path)?;
    
    // Generate OAuth .env.production if oauth directory exists
    let oauth_dir = path.join("oauth");
    if oauth_dir.exists() {
        generate_oauth_env(&path, &config)?;
    }
    
    // Create generator
    let generator = Generator::new(path, config)?;
    
    // Build the site
    generator.build().await?;
    
    println!("{}", "Build completed successfully!".green().bold());
    
    Ok(())
}

fn generate_oauth_env(path: &PathBuf, config: &Config) -> Result<()> {
    let oauth_dir = path.join("oauth");
    let env_file = oauth_dir.join(".env.production");
    
    // Extract configuration values
    let base_url = &config.site.base_url;
    let oauth_json = config.oauth.as_ref()
        .and_then(|o| o.json.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("client-metadata.json");
    let oauth_redirect = config.oauth.as_ref()
        .and_then(|o| o.redirect.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("oauth/callback");
    let admin_handle = config.oauth.as_ref()
        .and_then(|o| o.admin.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("ai.syui.ai");
    let ai_handle = config.ai.as_ref()
        .and_then(|a| a.handle.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("ai.syui.ai");
    let collection = config.oauth.as_ref()
        .and_then(|o| o.collection.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("ai.syui.log");
    let pds = config.oauth.as_ref()
        .and_then(|o| o.pds.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("syu.is");
    let handle_list = config.oauth.as_ref()
        .and_then(|o| o.handle_list.as_ref())
        .map(|list| format!("{:?}", list))
        .unwrap_or_else(|| "[\"syui.syui.ai\",\"yui.syui.ai\",\"ai.syui.ai\"]".to_string());
    
    // AI configuration
    let ai_enabled = config.ai.as_ref().map(|a| a.enabled).unwrap_or(true);
    let ai_ask_ai = config.ai.as_ref().and_then(|a| a.ask_ai).unwrap_or(true);
    let ai_provider = config.ai.as_ref()
        .and_then(|a| a.provider.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("ollama");
    let ai_model = config.ai.as_ref()
        .and_then(|a| a.model.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("gemma3:4b");
    let ai_host = config.ai.as_ref()
        .and_then(|a| a.host.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("https://ollama.syui.ai");
    let ai_system_prompt = config.ai.as_ref()
        .and_then(|a| a.system_prompt.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("あなたは6歳の女の子アイです。明るく元気で、ちょっとおっちょこちょい。自分のことは「アイ」って呼びます。白と金のワンピース姿。");
    
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
VITE_ATPROTO_WEB_URL=https://bsky.app
VITE_ATPROTO_HANDLE_LIST={}

# AI Configuration
VITE_AI_ENABLED={}
VITE_AI_ASK_AI={}
VITE_AI_PROVIDER={}
VITE_AI_MODEL={}
VITE_AI_HOST={}
VITE_AI_SYSTEM_PROMPT="{}"
"#,
        base_url,
        base_url, oauth_json,
        base_url, oauth_redirect,
        pds,
        admin_handle,
        ai_handle,
        collection,
        handle_list,
        ai_enabled,
        ai_ask_ai,
        ai_provider,
        ai_model,
        ai_host,
        ai_system_prompt
    );
    
    fs::write(&env_file, env_content)?;
    println!("  {} oauth/.env.production", "Generated".cyan());
    
    Ok(())
}