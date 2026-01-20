use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Bundle ID for the application
pub const BUNDLE_ID: &str = "ai.syui.log";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub did: String,
    pub handle: String,
    pub access_jwt: String,
    pub refresh_jwt: String,
    #[serde(default)]
    pub pds: Option<String>,
}

/// Get token file path: ~/Library/Application Support/ai.syui.log/token.json
pub fn token_path() -> Result<PathBuf> {
    let config_dir = dirs::config_dir()
        .context("Could not find config directory")?
        .join(BUNDLE_ID);

    fs::create_dir_all(&config_dir)?;
    Ok(config_dir.join("token.json"))
}

/// Get bot token file path: ~/Library/Application Support/ai.syui.log/bot.json
pub fn bot_token_path() -> Result<PathBuf> {
    let config_dir = dirs::config_dir()
        .context("Could not find config directory")?
        .join(BUNDLE_ID);

    fs::create_dir_all(&config_dir)?;
    Ok(config_dir.join("bot.json"))
}

/// Load session from token file
pub fn load_session() -> Result<Session> {
    let path = token_path()?;
    let content = fs::read_to_string(&path)
        .with_context(|| format!("Token file not found: {:?}. Run 'ailog login' first.", path))?;
    let session: Session = serde_json::from_str(&content)?;
    Ok(session)
}

/// Save session to token file
pub fn save_session(session: &Session) -> Result<()> {
    let path = token_path()?;
    let content = serde_json::to_string_pretty(session)?;
    fs::write(&path, content)?;
    println!("Token saved to {:?}", path);
    Ok(())
}

/// Load bot session from bot token file
pub fn load_bot_session() -> Result<Session> {
    let path = bot_token_path()?;
    let content = fs::read_to_string(&path)
        .with_context(|| format!("Bot token file not found: {:?}. Run 'ailog login --bot' first.", path))?;
    let session: Session = serde_json::from_str(&content)?;
    Ok(session)
}

/// Save bot session to bot token file
pub fn save_bot_session(session: &Session) -> Result<()> {
    let path = bot_token_path()?;
    let content = serde_json::to_string_pretty(session)?;
    fs::write(&path, content)?;
    println!("Bot token saved to {:?}", path);
    Ok(())
}
