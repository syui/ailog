use anyhow::Result;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::fs;
use chrono::Local;
use crate::mcp::types::*;
use crate::generator::Generator;
use crate::config::Config;

pub struct BlogTools {
    base_path: PathBuf,
}

impl BlogTools {
    pub fn new(base_path: PathBuf) -> Self {
        Self { base_path }
    }

    pub async fn create_post(&self, request: CreatePostRequest) -> Result<ToolResult> {
        let posts_dir = self.base_path.join("content/posts");
        
        // Generate slug if not provided
        let slug = request.slug.unwrap_or_else(|| {
            request.title
                .chars()
                .map(|c| if c.is_alphanumeric() || c == ' ' { c.to_lowercase().to_string() } else { "".to_string() })
                .collect::<String>()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join("-")
        });
        
        let date = Local::now().format("%Y-%m-%d").to_string();
        let filename = format!("{}-{}.md", date, slug);
        let filepath = posts_dir.join(&filename);
        
        // Create frontmatter
        let mut frontmatter = format!(
            "---\ntitle: {}\ndate: {}\n",
            request.title, date
        );
        
        if let Some(tags) = request.tags {
            if !tags.is_empty() {
                frontmatter.push_str(&format!("tags: {:?}\n", tags));
            }
        }
        
        frontmatter.push_str("---\n\n");
        
        // Create full content
        let full_content = format!("{}{}", frontmatter, request.content);
        
        // Ensure directory exists
        fs::create_dir_all(&posts_dir)?;
        
        // Write file
        fs::write(&filepath, full_content)?;
        
        Ok(ToolResult {
            content: vec![Content {
                content_type: "text".to_string(),
                text: format!("Post created successfully: {}", filename),
            }],
            is_error: None,
        })
    }

    pub async fn list_posts(&self, request: ListPostsRequest) -> Result<ToolResult> {
        let posts_dir = self.base_path.join("content/posts");
        
        if !posts_dir.exists() {
            return Ok(ToolResult {
                content: vec![Content {
                    content_type: "text".to_string(),
                    text: "No posts directory found".to_string(),
                }],
                is_error: Some(true),
            });
        }
        
        let mut posts = Vec::new();
        
        for entry in fs::read_dir(&posts_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                if let Ok(content) = fs::read_to_string(&path) {
                    // Parse frontmatter
                    if let Some((frontmatter_str, _)) = content.split_once("---\n") {
                        if let Some((_, frontmatter_content)) = frontmatter_str.split_once("---\n") {
                            // Simple YAML parsing for basic fields
                            let mut title = "Untitled".to_string();
                            let mut date = "Unknown".to_string();
                            let mut tags = Vec::new();
                            
                            for line in frontmatter_content.lines() {
                                if let Some((key, value)) = line.split_once(':') {
                                    let key = key.trim();
                                    let value = value.trim();
                                    
                                    match key {
                                        "title" => title = value.to_string(),
                                        "date" => date = value.to_string(),
                                        "tags" => {
                                            // Simple array parsing
                                            if value.starts_with('[') && value.ends_with(']') {
                                                let tags_str = &value[1..value.len()-1];
                                                tags = tags_str.split(',')
                                                    .map(|s| s.trim().trim_matches('"').to_string())
                                                    .collect();
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                            }
                            
                            let slug = path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("unknown")
                                .to_string();
                            
                            posts.push(PostInfo {
                                title,
                                slug: slug.clone(),
                                date,
                                tags,
                                url: format!("/posts/{}.html", slug),
                            });
                        }
                    }
                }
            }
        }
        
        // Apply pagination
        let offset = request.offset.unwrap_or(0);
        let limit = request.limit.unwrap_or(10);
        
        posts.sort_by(|a, b| b.date.cmp(&a.date));
        let paginated_posts: Vec<_> = posts.into_iter()
            .skip(offset)
            .take(limit)
            .collect();
        
        let result = json!({
            "posts": paginated_posts,
            "total": paginated_posts.len()
        });
        
        Ok(ToolResult {
            content: vec![Content {
                content_type: "text".to_string(),
                text: serde_json::to_string_pretty(&result)?,
            }],
            is_error: None,
        })
    }

    pub async fn build_blog(&self, request: BuildRequest) -> Result<ToolResult> {
        // Load configuration
        let config = Config::load(&self.base_path)?;
        
        // Create generator
        let generator = Generator::new(self.base_path.clone(), config)?;
        
        // Build the blog
        generator.build().await?;
        
        let message = if request.enable_ai.unwrap_or(false) {
            "Blog built successfully with AI features enabled"
        } else {
            "Blog built successfully"
        };
        
        Ok(ToolResult {
            content: vec![Content {
                content_type: "text".to_string(),
                text: message.to_string(),
            }],
            is_error: None,
        })
    }

    pub async fn get_post_content(&self, slug: &str) -> Result<ToolResult> {
        let posts_dir = self.base_path.join("content/posts");
        
        // Find file by slug
        for entry in fs::read_dir(&posts_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                if let Some(filename) = path.file_stem().and_then(|s| s.to_str()) {
                    if filename.contains(slug) {
                        let content = fs::read_to_string(&path)?;
                        return Ok(ToolResult {
                            content: vec![Content {
                                content_type: "text".to_string(),
                                text: content,
                            }],
                            is_error: None,
                        });
                    }
                }
            }
        }
        
        Ok(ToolResult {
            content: vec![Content {
                content_type: "text".to_string(),
                text: format!("Post with slug '{}' not found", slug),
            }],
            is_error: Some(true),
        })
    }

    pub async fn translate_document(&self, args: Value) -> Result<ToolResult> {
        use crate::commands::doc::DocCommand;
        use crate::commands::doc::DocAction;

        let input_file = args.get("input_file")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("input_file is required"))?;
        
        let target_lang = args.get("target_lang")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("target_lang is required"))?;
        
        let source_lang = args.get("source_lang").and_then(|v| v.as_str()).map(|s| s.to_string());
        let output_file = args.get("output_file").and_then(|v| v.as_str()).map(|s| PathBuf::from(s));
        let model = args.get("model").and_then(|v| v.as_str()).unwrap_or("qwen2.5:latest");
        let ollama_endpoint = args.get("ollama_endpoint").and_then(|v| v.as_str()).unwrap_or("http://localhost:11434");

        let doc_cmd = DocCommand {
            action: DocAction::Translate {
                input: PathBuf::from(input_file),
                target_lang: target_lang.to_string(),
                source_lang: source_lang.clone(),
                output: output_file,
                model: model.to_string(),
                ollama_endpoint: ollama_endpoint.to_string(),
            }
        };

        match doc_cmd.execute(self.base_path.clone()).await {
            Ok(_) => {
                let output_path = if let Some(output) = args.get("output_file").and_then(|v| v.as_str()) {
                    output.to_string()
                } else {
                    let input_path = PathBuf::from(input_file);
                    let stem = input_path.file_stem().unwrap().to_string_lossy();
                    let ext = input_path.extension().unwrap_or_default().to_string_lossy();
                    format!("{}.{}.{}", stem, target_lang, ext)
                };

                Ok(ToolResult {
                    content: vec![Content {
                        content_type: "text".to_string(),
                        text: format!("Document translated successfully from {} to {}. Output: {}", 
                                    source_lang.unwrap_or_else(|| "auto-detected".to_string()), 
                                    target_lang, output_path),
                    }],
                    is_error: None,
                })
            }
            Err(e) => Ok(ToolResult {
                content: vec![Content {
                    content_type: "text".to_string(),
                    text: format!("Translation failed: {}", e),
                }],
                is_error: Some(true),
            })
        }
    }

    pub async fn generate_documentation(&self, args: Value) -> Result<ToolResult> {
        use crate::commands::doc::DocCommand;
        use crate::commands::doc::DocAction;

        let doc_type = args.get("doc_type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("doc_type is required"))?;

        let source_path = args.get("source_path").and_then(|v| v.as_str()).unwrap_or(".");
        let output_path = args.get("output_path").and_then(|v| v.as_str());
        let with_ai = args.get("with_ai").and_then(|v| v.as_bool()).unwrap_or(true);
        let include_deps = args.get("include_deps").and_then(|v| v.as_bool()).unwrap_or(false);
        let format_type = args.get("format_type").and_then(|v| v.as_str()).unwrap_or("markdown");

        let action = match doc_type {
            "readme" => DocAction::Readme {
                source: PathBuf::from(source_path),
                output: PathBuf::from(output_path.unwrap_or("README.md")),
                with_ai,
            },
            "api" => DocAction::Api {
                source: PathBuf::from(source_path),
                output: PathBuf::from(output_path.unwrap_or("./docs")),
                format: format_type.to_string(),
            },
            "structure" => DocAction::Structure {
                source: PathBuf::from(source_path),
                output: PathBuf::from(output_path.unwrap_or("docs/structure.md")),
                include_deps,
            },
            "changelog" => DocAction::Changelog {
                from: None,
                to: None,
                output: PathBuf::from(output_path.unwrap_or("CHANGELOG.md")),
                explain_changes: with_ai,
            },
            _ => return Ok(ToolResult {
                content: vec![Content {
                    content_type: "text".to_string(),
                    text: format!("Unsupported doc_type: {}. Supported types: readme, api, structure, changelog", doc_type),
                }],
                is_error: Some(true),
            })
        };

        let doc_cmd = DocCommand { action };

        match doc_cmd.execute(self.base_path.clone()).await {
            Ok(_) => {
                let output_path = match doc_type {
                    "readme" => output_path.unwrap_or("README.md"),
                    "api" => output_path.unwrap_or("./docs"),
                    "structure" => output_path.unwrap_or("docs/structure.md"),
                    "changelog" => output_path.unwrap_or("CHANGELOG.md"),
                    _ => "unknown"
                };

                Ok(ToolResult {
                    content: vec![Content {
                        content_type: "text".to_string(),
                        text: format!("{} documentation generated successfully. Output: {}", 
                                    doc_type.to_uppercase(), output_path),
                    }],
                    is_error: None,
                })
            }
            Err(e) => Ok(ToolResult {
                content: vec![Content {
                    content_type: "text".to_string(),
                    text: format!("Documentation generation failed: {}", e),
                }],
                is_error: Some(true),
            })
        }
    }

    pub fn get_tools() -> Vec<Tool> {
        vec![
            Tool {
                name: "create_blog_post".to_string(),
                description: "Create a new blog post with title, content, and optional tags".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "The title of the blog post"
                        },
                        "content": {
                            "type": "string",
                            "description": "The content of the blog post in Markdown format"
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional tags for the blog post"
                        },
                        "slug": {
                            "type": "string",
                            "description": "Optional custom slug for the post URL"
                        }
                    },
                    "required": ["title", "content"]
                }),
            },
            Tool {
                name: "list_blog_posts".to_string(),
                description: "List existing blog posts with pagination".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of posts to return (default: 10)"
                        },
                        "offset": {
                            "type": "integer",
                            "description": "Number of posts to skip (default: 0)"
                        }
                    }
                }),
            },
            Tool {
                name: "build_blog".to_string(),
                description: "Build the static blog with AI features".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "enable_ai": {
                            "type": "boolean",
                            "description": "Enable AI features during build (default: false)"
                        },
                        "translate": {
                            "type": "boolean",
                            "description": "Enable automatic translation (default: false)"
                        }
                    }
                }),
            },
            Tool {
                name: "get_post_content".to_string(),
                description: "Get the full content of a blog post by slug".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "slug": {
                            "type": "string",
                            "description": "The slug of the blog post to retrieve"
                        }
                    },
                    "required": ["slug"]
                }),
            },
            Tool {
                name: "translate_document".to_string(),
                description: "Translate markdown documents using Ollama AI while preserving structure".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "input_file": {
                            "type": "string",
                            "description": "Path to the input markdown file"
                        },
                        "target_lang": {
                            "type": "string",
                            "description": "Target language code (en, ja, zh, ko, es)"
                        },
                        "source_lang": {
                            "type": "string",
                            "description": "Source language code (auto-detect if not specified)"
                        },
                        "output_file": {
                            "type": "string",
                            "description": "Output file path (auto-generated if not specified)"
                        },
                        "model": {
                            "type": "string",
                            "description": "Ollama model to use (default: qwen2.5:latest)"
                        },
                        "ollama_endpoint": {
                            "type": "string",
                            "description": "Ollama API endpoint (default: http://localhost:11434)"
                        }
                    },
                    "required": ["input_file", "target_lang"]
                }),
            },
            Tool {
                name: "generate_documentation".to_string(),
                description: "Generate various types of documentation from code analysis".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "doc_type": {
                            "type": "string",
                            "enum": ["readme", "api", "structure", "changelog"],
                            "description": "Type of documentation to generate"
                        },
                        "source_path": {
                            "type": "string",
                            "description": "Source directory to analyze (default: current directory)"
                        },
                        "output_path": {
                            "type": "string",
                            "description": "Output file or directory path"
                        },
                        "with_ai": {
                            "type": "boolean",
                            "description": "Include AI-generated insights (default: true)"
                        },
                        "include_deps": {
                            "type": "boolean",
                            "description": "Include dependency analysis (default: false)"
                        },
                        "format_type": {
                            "type": "string",
                            "enum": ["markdown", "html", "json"],
                            "description": "Output format (default: markdown)"
                        }
                    },
                    "required": ["doc_type"]
                }),
            },
        ]
    }
}