use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::env;

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
    pub api_key: Option<String>,
    pub gpt_endpoint: Option<String>,
    pub atproto_config: Option<AtprotoConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AtprotoConfig {
    pub client_id: String,
    pub redirect_uri: String,
    pub handle_resolver: String,
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        let config_path = path.join("config.toml");
        let content = fs::read_to_string(config_path)?;
        let mut config: Config = toml::from_str(&content)?;
        
        // Load global config and merge
        if let Ok(global_config) = Self::load_global_config() {
            config = config.merge(global_config);
        }
        
        // Override with environment variables
        config.override_from_env();
        
        Ok(config)
    }
    
    fn load_global_config() -> Result<Config> {
        let config_dir = Self::global_config_dir();
        let config_path = config_dir.join("config.toml");
        
        if config_path.exists() {
            let content = fs::read_to_string(config_path)?;
            let config: Config = toml::from_str(&content)?;
            Ok(config)
        } else {
            anyhow::bail!("Global config not found")
        }
    }
    
    pub fn global_config_dir() -> PathBuf {
        if let Ok(home) = env::var("HOME") {
            PathBuf::from(home).join(".config").join("syui").join("ai").join("log")
        } else {
            PathBuf::from("~/.config/syui/ai/log")
        }
    }
    
    fn merge(mut self, global: Config) -> Self {
        // Merge AI config
        if let Some(global_ai) = global.ai {
            if let Some(ref mut ai) = self.ai {
                if ai.api_key.is_none() {
                    ai.api_key = global_ai.api_key;
                }
                if ai.gpt_endpoint.is_none() {
                    ai.gpt_endpoint = global_ai.gpt_endpoint;
                }
                if ai.atproto_config.is_none() {
                    ai.atproto_config = global_ai.atproto_config;
                }
            } else {
                self.ai = Some(global_ai);
            }
        }
        self
    }
    
    fn override_from_env(&mut self) {
        if let Ok(api_key) = env::var("AILOG_API_KEY") {
            if let Some(ref mut ai) = self.ai {
                ai.api_key = Some(api_key);
            }
        }
        
        if let Ok(endpoint) = env::var("AILOG_GPT_ENDPOINT") {
            if let Some(ref mut ai) = self.ai {
                ai.gpt_endpoint = Some(endpoint);
            }
        }
    }
    
    #[allow(dead_code)]
    pub fn save_global(&self) -> Result<()> {
        let config_dir = Self::global_config_dir();
        fs::create_dir_all(&config_dir)?;
        
        let config_path = config_dir.join("config.toml");
        let content = toml::to_string_pretty(self)?;
        fs::write(config_path, content)?;
        
        Ok(())
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
                api_key: None,
                gpt_endpoint: None,
                atproto_config: None,
            }),
        }
    }
}