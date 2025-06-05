use anyhow::Result;
use crate::ai::gpt_client::GptClient;

pub struct Translator<'a> {
    client: &'a GptClient,
}

impl<'a> Translator<'a> {
    pub fn new(client: &'a GptClient) -> Self {
        Self { client }
    }

    pub async fn translate(&self, content: &str, from: &str, to: &str) -> Result<String> {
        let system_prompt = format!(
            "You are a professional translator. Translate the following text from {} to {}. \
             Maintain the original formatting, including Markdown syntax. \
             Only return the translated text without any explanations.",
            from, to
        );

        self.client.chat(&system_prompt, content).await
    }

    pub async fn translate_post(&self, title: &str, content: &str, from: &str, to: &str) -> Result<(String, String)> {
        // Translate title
        let translated_title = self.translate(title, from, to).await?;
        
        // Translate content while preserving markdown structure
        let translated_content = self.translate(content, from, to).await?;
        
        Ok((translated_title, translated_content))
    }
}