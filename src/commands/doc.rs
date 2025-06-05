use anyhow::Result;
use clap::{Subcommand, Parser};
use std::path::PathBuf;
use crate::analyzer::CodeAnalyzer;
use crate::doc_generator::DocGenerator;
use crate::translator::{TranslationConfig, Translator};
use crate::translator::ollama_translator::OllamaTranslator;

#[derive(Parser)]
#[command(about = "Generate documentation from code")]
pub struct DocCommand {
    #[command(subcommand)]
    pub action: DocAction,
}

#[derive(Subcommand)]
pub enum DocAction {
    /// Generate README.md from project analysis
    Readme {
        /// Source directory to analyze
        #[arg(long, default_value = ".")]
        source: PathBuf,
        /// Output file path
        #[arg(long, default_value = "README.md")]
        output: PathBuf,
        /// Include AI-generated insights
        #[arg(long)]
        with_ai: bool,
    },
    /// Generate API documentation
    Api {
        /// Source directory to analyze
        #[arg(long, default_value = "./src")]
        source: PathBuf,
        /// Output directory
        #[arg(long, default_value = "./docs")]
        output: PathBuf,
        /// Output format (markdown, html, json)
        #[arg(long, default_value = "markdown")]
        format: String,
    },
    /// Analyze and document project structure
    Structure {
        /// Source directory to analyze
        #[arg(long, default_value = ".")]
        source: PathBuf,
        /// Output file path
        #[arg(long, default_value = "docs/structure.md")]
        output: PathBuf,
        /// Include dependency graph
        #[arg(long)]
        include_deps: bool,
    },
    /// Generate changelog from git commits
    Changelog {
        /// Start from this commit/tag
        #[arg(long)]
        from: Option<String>,
        /// End at this commit/tag
        #[arg(long)]
        to: Option<String>,
        /// Output file path
        #[arg(long, default_value = "CHANGELOG.md")]
        output: PathBuf,
        /// Include AI explanations for changes
        #[arg(long)]
        explain_changes: bool,
    },
    /// Translate documentation using Ollama
    Translate {
        /// Input file path
        #[arg(long)]
        input: PathBuf,
        /// Target language (en, ja, zh, ko, es)
        #[arg(long)]
        target_lang: String,
        /// Source language (auto-detect if not specified)
        #[arg(long)]
        source_lang: Option<String>,
        /// Output file path (auto-generated if not specified)
        #[arg(long)]
        output: Option<PathBuf>,
        /// Ollama model to use
        #[arg(long, default_value = "qwen2.5:latest")]
        model: String,
        /// Ollama endpoint
        #[arg(long, default_value = "http://localhost:11434")]
        ollama_endpoint: String,
    },
}

impl DocCommand {
    pub async fn execute(self, base_path: PathBuf) -> Result<()> {
        match self.action {
            DocAction::Readme { ref source, ref output, with_ai } => {
                self.generate_readme(base_path, source.clone(), output.clone(), with_ai).await
            }
            DocAction::Api { ref source, ref output, ref format } => {
                self.generate_api_docs(base_path, source.clone(), output.clone(), format.clone()).await
            }
            DocAction::Structure { ref source, ref output, include_deps } => {
                self.analyze_structure(base_path, source.clone(), output.clone(), include_deps).await
            }
            DocAction::Changelog { ref from, ref to, ref output, explain_changes } => {
                self.generate_changelog(base_path, from.clone(), to.clone(), output.clone(), explain_changes).await
            }
            DocAction::Translate { ref input, ref target_lang, ref source_lang, ref output, ref model, ref ollama_endpoint } => {
                self.translate_document(input.clone(), target_lang.clone(), source_lang.clone(), output.clone(), model.clone(), ollama_endpoint.clone()).await
            }
        }
    }

    async fn generate_readme(
        &self,
        base_path: PathBuf,
        source: PathBuf,
        output: PathBuf,
        with_ai: bool,
    ) -> Result<()> {
        println!("🔍 Analyzing project for README generation...");
        
        let analyzer = CodeAnalyzer::new();
        let generator = DocGenerator::new(base_path.clone(), with_ai);
        
        let project_info = analyzer.analyze_project(&source)?;
        let readme_content = generator.generate_readme(&project_info).await?;
        
        std::fs::write(&output, readme_content)?;
        
        println!("✅ README generated: {}", output.display());
        Ok(())
    }

    async fn generate_api_docs(
        &self,
        base_path: PathBuf,
        source: PathBuf,
        output: PathBuf,
        format: String,
    ) -> Result<()> {
        println!("📚 Generating API documentation...");
        
        let analyzer = CodeAnalyzer::new();
        let generator = DocGenerator::new(base_path.clone(), true);
        
        let api_info = analyzer.analyze_api(&source)?;
        
        match format.as_str() {
            "markdown" => {
                let docs = generator.generate_api_markdown(&api_info).await?;
                std::fs::create_dir_all(&output)?;
                
                for (filename, content) in docs {
                    let file_path = output.join(filename);
                    std::fs::write(&file_path, content)?;
                    println!("  📄 Generated: {}", file_path.display());
                }
            }
            "html" => {
                println!("HTML format not yet implemented");
            }
            "json" => {
                let json_content = serde_json::to_string_pretty(&api_info)?;
                let file_path = output.join("api.json");
                std::fs::create_dir_all(&output)?;
                std::fs::write(&file_path, json_content)?;
                println!("  📄 Generated: {}", file_path.display());
            }
            _ => {
                anyhow::bail!("Unsupported format: {}", format);
            }
        }
        
        println!("✅ API documentation generated in: {}", output.display());
        Ok(())
    }

    async fn analyze_structure(
        &self,
        base_path: PathBuf,
        source: PathBuf,
        output: PathBuf,
        include_deps: bool,
    ) -> Result<()> {
        println!("🏗️  Analyzing project structure...");
        
        let analyzer = CodeAnalyzer::new();
        let generator = DocGenerator::new(base_path.clone(), false);
        
        let structure = analyzer.analyze_structure(&source, include_deps)?;
        let structure_doc = generator.generate_structure_doc(&structure).await?;
        
        // Ensure output directory exists
        if let Some(parent) = output.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        std::fs::write(&output, structure_doc)?;
        
        println!("✅ Structure documentation generated: {}", output.display());
        Ok(())
    }

    async fn generate_changelog(
        &self,
        base_path: PathBuf,
        from: Option<String>,
        to: Option<String>,
        output: PathBuf,
        explain_changes: bool,
    ) -> Result<()> {
        println!("📝 Generating changelog from git history...");
        
        let generator = DocGenerator::new(base_path.clone(), explain_changes);
        let changelog = generator.generate_changelog(from, to).await?;
        
        std::fs::write(&output, changelog)?;
        
        println!("✅ Changelog generated: {}", output.display());
        Ok(())
    }

    async fn translate_document(
        &self,
        input: PathBuf,
        target_lang: String,
        source_lang: Option<String>,
        output: Option<PathBuf>,
        model: String,
        ollama_endpoint: String,
    ) -> Result<()> {
        println!("🌍 Translating document with Ollama...");
        
        // Read input file
        let content = std::fs::read_to_string(&input)?;
        println!("📖 Read {} characters from {}", content.len(), input.display());
        
        // Setup translation config
        let config = TranslationConfig {
            source_lang: source_lang.unwrap_or_else(|| {
                // Simple language detection based on content
                if content.chars().any(|c| {
                    (c >= '\u{3040}' && c <= '\u{309F}') || // Hiragana
                    (c >= '\u{30A0}' && c <= '\u{30FF}') || // Katakana
                    (c >= '\u{4E00}' && c <= '\u{9FAF}')    // CJK Unified Ideographs
                }) {
                    "ja".to_string()
                } else {
                    "en".to_string()
                }
            }),
            target_lang,
            ollama_endpoint,
            model,
            preserve_code: true,
            preserve_links: true,
        };
        
        println!("🔧 Translation config: {} → {}", config.source_lang, config.target_lang);
        println!("🤖 Using model: {} at {}", config.model, config.ollama_endpoint);
        
        // Create translator
        let translator = OllamaTranslator::new();
        
        // Perform translation
        let translated = translator.translate_markdown(&content, &config).await?;
        
        // Determine output path
        let output_path = match output {
            Some(path) => path,
            None => {
                let input_stem = input.file_stem().unwrap().to_string_lossy();
                let input_ext = input.extension().unwrap_or_default().to_string_lossy();
                let output_name = format!("{}.{}.{}", input_stem, config.target_lang, input_ext);
                input.parent().unwrap_or_else(|| std::path::Path::new(".")).join(output_name)
            }
        };
        
        // Write translated content
        std::fs::write(&output_path, translated)?;
        
        println!("✅ Translation completed: {}", output_path.display());
        println!("📝 Language: {} → {}", config.source_lang, config.target_lang);
        
        Ok(())
    }
}