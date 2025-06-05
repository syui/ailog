use anyhow::Result;
use crate::ai::gpt_client::GptClient;

pub struct Editor<'a> {
    client: &'a GptClient,
}

impl<'a> Editor<'a> {
    pub fn new(client: &'a GptClient) -> Self {
        Self { client }
    }

    pub async fn enhance(&self, content: &str, context: &str) -> Result<String> {
        let system_prompt = "You are a helpful content editor. Enhance the given content by:
1. Fixing any grammatical errors
2. Improving clarity and readability
3. Adding relevant information if needed
4. Maintaining the original tone and style
5. Preserving all Markdown formatting

Only return the enhanced content without explanations.";

        let user_prompt = format!(
            "Context: {}\n\nContent to enhance:\n{}",
            context, content
        );

        self.client.chat(system_prompt, &user_prompt).await
    }

    pub async fn suggest_improvements(&self, content: &str) -> Result<Vec<String>> {
        let system_prompt = "You are a content analyzer. Analyze the given content and provide:
1. Suggestions for improving the content
2. Missing information that could be added
3. Potential SEO improvements
Return the suggestions as a JSON array of strings.";

        let response = self.client.chat(system_prompt, content).await?;
        
        // Parse JSON response
        match serde_json::from_str::<Vec<String>>(&response) {
            Ok(suggestions) => Ok(suggestions),
            Err(_) => {
                // Fallback: split by newlines if not valid JSON
                Ok(response.lines()
                    .filter(|s| !s.trim().is_empty())
                    .map(|s| s.to_string())
                    .collect())
            }
        }
    }

    pub async fn add_ai_note(&self, content: &str, topic: &str) -> Result<String> {
        let system_prompt = format!(
            "You are AI (存在子/ai). Add a brief, insightful comment about the topic '{}' \
             from your unique perspective. Keep it concise (1-2 sentences) and thoughtful. \
             Return only the comment text in Japanese.",
            topic
        );

        self.client.chat(&system_prompt, content).await
    }
}