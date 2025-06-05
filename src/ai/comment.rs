use anyhow::Result;
use serde::{Deserialize, Serialize};
use crate::ai::gpt_client::GptClient;
use crate::ai::editor::Editor;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiComment {
    pub content: String,
    pub author: String,
    pub timestamp: String,
}

pub struct CommentGenerator<'a> {
    client: &'a GptClient,
}

impl<'a> CommentGenerator<'a> {
    pub fn new(client: &'a GptClient) -> Self {
        Self { client }
    }

    pub async fn generate_comment(&self, post_title: &str, post_content: &str) -> Result<AiComment> {
        let editor = Editor::new(self.client);
        let comment_content = editor.add_ai_note(post_content, post_title).await?;
        
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        Ok(AiComment {
            content: comment_content,
            author: "AI (存在子)".to_string(),
            timestamp,
        })
    }
}