use anyhow::Result;
use reqwest::Client;
use serde_json::json;
use std::time::Instant;
use super::*;
use crate::translator::markdown_parser::MarkdownParser;

#[derive(Clone)]
pub struct OllamaTranslator {
    client: Client,
    language_mapping: LanguageMapping,
    parser: MarkdownParser,
}

impl OllamaTranslator {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            language_mapping: LanguageMapping::new(),
            parser: MarkdownParser::new(),
        }
    }
    
    async fn call_ollama(&self, prompt: &str, config: &TranslationConfig) -> Result<String> {
        let request_body = json!({
            "model": config.model,
            "prompt": prompt,
            "stream": false,
            "options": {
                "temperature": 0.3,
                "top_p": 0.9,
                "top_k": 40
            }
        });
        
        let url = format!("{}/api/generate", config.ollama_endpoint);
        
        let response = self.client
            .post(&url)
            .json(&request_body)
            .send()
            .await?;
        
        if !response.status().is_success() {
            anyhow::bail!("Ollama API request failed: {}", response.status());
        }
        
        let response_text = response.text().await?;
        let response_json: serde_json::Value = serde_json::from_str(&response_text)?;
        
        let translated = response_json
            .get("response")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Invalid response from Ollama"))?;
        
        Ok(translated.to_string())
    }
    
    fn build_translation_prompt(&self, text: &str, config: &TranslationConfig) -> Result<String> {
        let source_info = self.language_mapping.get_language_info(&config.source_lang)
            .ok_or_else(|| anyhow::anyhow!("Unsupported source language: {}", config.source_lang))?;
        
        let target_info = self.language_mapping.get_language_info(&config.target_lang)
            .ok_or_else(|| anyhow::anyhow!("Unsupported target language: {}", config.target_lang))?;
        
        let prompt = format!(
            r#"{system_prompt}

Translate the following text from {source_lang} to {target_lang}.

IMPORTANT RULES:
1. Preserve all Markdown formatting (headers, links, code blocks, etc.)
2. Do NOT translate content within code blocks (```)
3. Do NOT translate URLs or file paths
4. Preserve technical terms when appropriate
5. Maintain the original structure and formatting
6. Only output the translated text, no explanations

Original text ({source_code}):
{text}

Translated text ({target_code}):"#,
            system_prompt = target_info.ollama_prompt,
            source_lang = source_info.name,
            target_lang = target_info.name,
            source_code = source_info.code,
            target_code = target_info.code,
            text = text
        );
        
        Ok(prompt)
    }
    
    fn build_section_translation_prompt(&self, section: &MarkdownSection, config: &TranslationConfig) -> Result<String> {
        let target_info = self.language_mapping.get_language_info(&config.target_lang)
            .ok_or_else(|| anyhow::anyhow!("Unsupported target language: {}", config.target_lang))?;
        
        let (content, section_type) = match section {
            MarkdownSection::Text(text) => (text.clone(), "text"),
            MarkdownSection::Header(text, _) => (text.clone(), "header"),
            MarkdownSection::Quote(text) => (text.clone(), "quote"),
            MarkdownSection::List(text) => (text.clone(), "list"),
            _ => return Ok(String::new()), // Skip translation for code, links, etc.
        };
        
        let prompt = format!(
            r#"{system_prompt}

Translate this {section_type} from {source_lang} to {target_lang}.

RULES:
- Only translate the text content
- Preserve formatting symbols (*, #, >, etc.)
- Keep technical terms when appropriate
- Output only the translated text

Text to translate:
{content}

Translation:"#,
            system_prompt = target_info.ollama_prompt,
            section_type = section_type,
            source_lang = config.source_lang,
            target_lang = config.target_lang,
            content = content
        );
        
        Ok(prompt)
    }
}

impl Translator for OllamaTranslator {
    fn translate(&self, content: &str, config: &TranslationConfig) -> impl std::future::Future<Output = Result<String>> + Send {
        async move {
            let prompt = self.build_translation_prompt(content, config)?;
            self.call_ollama(&prompt, config).await
        }
    }
    
    fn translate_markdown(&self, content: &str, config: &TranslationConfig) -> impl std::future::Future<Output = Result<String>> + Send {
        async move {
            println!("🔄 Parsing markdown content...");
            let sections = self.parser.parse_markdown(content)?;
            
            println!("📝 Found {} sections to process", sections.len());
            let translated_sections = self.translate_sections(sections, config).await?;
            
            println!("✅ Rebuilding markdown from translated sections...");
            let result = self.parser.rebuild_markdown(translated_sections);
            
            Ok(result)
        }
    }
    
    fn translate_sections(&self, sections: Vec<MarkdownSection>, config: &TranslationConfig) -> impl std::future::Future<Output = Result<Vec<MarkdownSection>>> + Send {
        let config = config.clone();
        let client = self.client.clone();
        let parser = self.parser.clone();
        let language_mapping = self.language_mapping.clone();
        
        async move {
            let translator = OllamaTranslator {
                client,
                language_mapping,
                parser,
            };
            
            let mut translated_sections = Vec::new();
            let start_time = Instant::now();
        
            for (index, section) in sections.into_iter().enumerate() {
                println!("  🔤 Processing section {}", index + 1);
                
                let translated_section = match &section {
                    MarkdownSection::Code(_content, _lang) => {
                        if config.preserve_code {
                            println!("    ⏭️  Preserving code block");
                            section // Preserve code blocks
                        } else {
                            section // Still preserve for now
                        }
                    }
                    MarkdownSection::Link(text, url) => {
                        if config.preserve_links {
                            println!("    ⏭️  Preserving link");
                            section // Preserve links
                        } else {
                            // Translate link text only
                            let prompt = translator.build_section_translation_prompt(&MarkdownSection::Text(text.clone()), &config)?;
                            let translated_text = translator.call_ollama(&prompt, &config).await?;
                            MarkdownSection::Link(translated_text.trim().to_string(), url.clone())
                        }
                    }
                    MarkdownSection::Image(_alt, _url) => {
                        println!("    🖼️  Preserving image");
                        section // Preserve images
                    }
                    MarkdownSection::Table(content) => {
                        println!("    📊 Translating table content");
                        let prompt = translator.build_section_translation_prompt(&MarkdownSection::Text(content.clone()), &config)?;
                        let translated_content = translator.call_ollama(&prompt, &config).await?;
                        MarkdownSection::Table(translated_content.trim().to_string())
                    }
                    _ => {
                        // Translate text sections
                        println!("    🔤 Translating text");
                        let prompt = translator.build_section_translation_prompt(&section, &config)?;
                        let translated_text = translator.call_ollama(&prompt, &config).await?;
                        
                        match section {
                            MarkdownSection::Text(_) => MarkdownSection::Text(translated_text.trim().to_string()),
                            MarkdownSection::Header(_, level) => MarkdownSection::Header(translated_text.trim().to_string(), level),
                            MarkdownSection::Quote(_) => MarkdownSection::Quote(translated_text.trim().to_string()),
                            MarkdownSection::List(_) => MarkdownSection::List(translated_text.trim().to_string()),
                            _ => section,
                        }
                    }
                };
                
                translated_sections.push(translated_section);
                
                // Add small delay to avoid overwhelming Ollama
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
        
            let elapsed = start_time.elapsed();
            println!("⏱️  Translation completed in {:.2}s", elapsed.as_secs_f64());
        
            Ok(translated_sections)
        }
    }
}