pub mod ollama_translator;
pub mod markdown_parser;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationConfig {
    pub source_lang: String,
    pub target_lang: String,
    pub ollama_endpoint: String,
    pub model: String,
    pub preserve_code: bool,
    pub preserve_links: bool,
}

impl Default for TranslationConfig {
    fn default() -> Self {
        Self {
            source_lang: "ja".to_string(),
            target_lang: "en".to_string(),
            ollama_endpoint: "http://localhost:11434".to_string(),
            model: "qwen2.5:latest".to_string(),
            preserve_code: true,
            preserve_links: true,
        }
    }
}

#[derive(Debug, Clone)]
pub enum MarkdownSection {
    Text(String),
    Code(String, Option<String>), // content, language
    Header(String, u8), // content, level (1-6)
    Link(String, String), // text, url
    Image(String, String), // alt, url
    Table(String),
    List(String),
    Quote(String),
}

pub trait Translator {
    #[allow(dead_code)]
    fn translate(&self, content: &str, config: &TranslationConfig) -> impl std::future::Future<Output = Result<String>> + Send;
    fn translate_markdown(&self, content: &str, config: &TranslationConfig) -> impl std::future::Future<Output = Result<String>> + Send;
    fn translate_sections(&self, sections: Vec<MarkdownSection>, config: &TranslationConfig) -> impl std::future::Future<Output = Result<Vec<MarkdownSection>>> + Send;
}

#[allow(dead_code)]
pub struct TranslationResult {
    pub original: String,
    pub translated: String,
    pub source_lang: String,
    pub target_lang: String,
    pub model: String,
    pub metrics: TranslationMetrics,
}

#[derive(Debug, Clone, Default)]
#[allow(dead_code)]
pub struct TranslationMetrics {
    pub character_count: usize,
    pub word_count: usize,
    pub translation_time_ms: u64,
    pub sections_translated: usize,
    pub sections_preserved: usize,
}

#[derive(Clone)]
pub struct LanguageMapping {
    pub mappings: HashMap<String, LanguageInfo>,
}

#[derive(Debug, Clone)]
pub struct LanguageInfo {
    #[allow(dead_code)]
    pub name: String,
    #[allow(dead_code)]
    pub code: String,
    pub ollama_prompt: String,
}

impl LanguageMapping {
    pub fn new() -> Self {
        let mut mappings = HashMap::new();
        
        // 主要言語の設定
        mappings.insert("ja".to_string(), LanguageInfo {
            name: "Japanese".to_string(),
            code: "ja".to_string(),
            ollama_prompt: "You are a professional Japanese translator specializing in technical documentation.".to_string(),
        });
        
        mappings.insert("en".to_string(), LanguageInfo {
            name: "English".to_string(),
            code: "en".to_string(),
            ollama_prompt: "You are a professional English translator specializing in technical documentation.".to_string(),
        });
        
        mappings.insert("zh".to_string(), LanguageInfo {
            name: "Chinese".to_string(),
            code: "zh".to_string(),
            ollama_prompt: "You are a professional Chinese translator specializing in technical documentation.".to_string(),
        });
        
        mappings.insert("ko".to_string(), LanguageInfo {
            name: "Korean".to_string(),
            code: "ko".to_string(),
            ollama_prompt: "You are a professional Korean translator specializing in technical documentation.".to_string(),
        });
        
        mappings.insert("es".to_string(), LanguageInfo {
            name: "Spanish".to_string(),
            code: "es".to_string(),
            ollama_prompt: "You are a professional Spanish translator specializing in technical documentation.".to_string(),
        });
        
        Self { mappings }
    }
    
    pub fn get_language_info(&self, code: &str) -> Option<&LanguageInfo> {
        self.mappings.get(code)
    }
    
    #[allow(dead_code)]
    pub fn get_supported_languages(&self) -> Vec<String> {
        self.mappings.keys().cloned().collect()
    }
}