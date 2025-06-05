pub mod translator;
pub mod editor;
pub mod gpt_client;
pub mod comment;

pub use translator::Translator;
pub use editor::Editor;
pub use gpt_client::GptClient;
pub use comment::{AiComment, CommentGenerator};

use anyhow::Result;
use crate::config::AiConfig;

pub struct AiManager {
    config: AiConfig,
    gpt_client: Option<GptClient>,
}

impl AiManager {
    pub fn new(config: AiConfig) -> Self {
        let gpt_client = if config.enabled && config.api_key.is_some() {
            Some(GptClient::new(
                config.api_key.clone().unwrap(),
                config.gpt_endpoint.clone(),
            ))
        } else {
            None
        };

        Self {
            config,
            gpt_client,
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.config.enabled && self.gpt_client.is_some()
    }

    pub async fn translate(&self, content: &str, from: &str, to: &str) -> Result<String> {
        if !self.is_enabled() || !self.config.auto_translate {
            return Ok(content.to_string());
        }

        if let Some(client) = &self.gpt_client {
            let translator = Translator::new(client);
            translator.translate(content, from, to).await
        } else {
            Ok(content.to_string())
        }
    }

    pub async fn enhance_content(&self, content: &str, context: &str) -> Result<String> {
        if !self.is_enabled() {
            return Ok(content.to_string());
        }

        if let Some(client) = &self.gpt_client {
            let editor = Editor::new(client);
            editor.enhance(content, context).await
        } else {
            Ok(content.to_string())
        }
    }
    
    pub async fn generate_comment(&self, post_title: &str, post_content: &str) -> Result<Option<AiComment>> {
        if !self.is_enabled() || !self.config.comment_moderation {
            return Ok(None);
        }
        
        if let Some(client) = &self.gpt_client {
            let generator = CommentGenerator::new(client);
            let comment = generator.generate_comment(post_title, post_content).await?;
            Ok(Some(comment))
        } else {
            Ok(None)
        }
    }
}