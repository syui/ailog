use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub site: SiteConfig,
    pub build: BuildConfig,
    pub ai: Option<AiConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SiteConfig {
    pub title: String,
    pub description: String,
    pub base_url: String,
    pub language: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BuildConfig {
    pub highlight_code: bool,
    pub minify: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiConfig {
    pub enabled: bool,
    pub auto_translate: bool,
    pub comment_moderation: bool,
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        let config_path = path.join("config.toml");
        let content = fs::read_to_string(config_path)?;
        let config: Config = toml::from_str(&content)?;
        Ok(config)
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            site: SiteConfig {
                title: "My Blog".to_string(),
                description: "A blog powered by ailog".to_string(),
                base_url: "https://example.com".to_string(),
                language: "ja".to_string(),
            },
            build: BuildConfig {
                highlight_code: true,
                minify: false,
            },
            ai: Some(AiConfig {
                enabled: false,
                auto_translate: false,
                comment_moderation: false,
            }),
        }
    }
}