use anyhow::{Context, Result};
use std::fs;

use super::token::BUNDLE_ID;

const DEFAULT_CONFIG: &str = include_str!("../rules/config.json");

/// Run setup: copy config.json to $cfg/ai.syui.log/
pub fn run() -> Result<()> {
    let cfg_dir = dirs::config_dir()
        .context("Could not find config directory")?
        .join(BUNDLE_ID);
    fs::create_dir_all(&cfg_dir)?;

    let cfg_file = cfg_dir.join("config.json");

    // Prefer local public/config.json
    let content = if std::path::Path::new("public/config.json").exists() {
        fs::read_to_string("public/config.json")?
    } else {
        DEFAULT_CONFIG.to_string()
    };

    fs::write(&cfg_file, &content)?;
    println!("ok {}", cfg_file.display());

    Ok(())
}
