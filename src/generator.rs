use anyhow::Result;
use colored::Colorize;
use std::path::PathBuf;
use walkdir::WalkDir;
use std::fs;
use crate::config::Config;
use crate::markdown::MarkdownProcessor;
use crate::template::TemplateEngine;
use crate::ai::AiManager;

pub struct Generator {
    base_path: PathBuf,
    config: Config,
    markdown_processor: MarkdownProcessor,
    template_engine: TemplateEngine,
    ai_manager: Option<AiManager>,
}

impl Generator {
    pub fn new(base_path: PathBuf, config: Config) -> Result<Self> {
        let markdown_processor = MarkdownProcessor::new(config.build.highlight_code, config.build.highlight_theme.clone());
        let template_engine = TemplateEngine::new(base_path.join("templates"))?;
        
        let ai_manager = if let Some(ref ai_config) = config.ai {
            if ai_config.enabled {
                Some(AiManager::new(ai_config.clone()))
            } else {
                None
            }
        } else {
            None
        };

        Ok(Self {
            base_path,
            config,
            markdown_processor,
            template_engine,
            ai_manager,
        })
    }
    
    fn create_config_with_timestamp(&self) -> Result<serde_json::Value> {
        let mut config_with_timestamp = serde_json::to_value(&self.config.site)?;
        if let Some(config_obj) = config_with_timestamp.as_object_mut() {
            config_obj.insert("build_timestamp".to_string(), serde_json::Value::String(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs()
                    .to_string()
            ));
        }
        Ok(config_with_timestamp)
    }

    pub async fn build(&self) -> Result<()> {
        // Clean public directory
        let public_dir = self.base_path.join("public");
        if public_dir.exists() {
            fs::remove_dir_all(&public_dir)?;
        }
        fs::create_dir_all(&public_dir)?;

        // Copy static files
        self.copy_static_files()?;

        // Process posts
        let posts = self.process_posts().await?;

        // Generate index page
        self.generate_index(&posts).await?;

        // Generate JSON index for API access
        self.generate_json_index(&posts).await?;

        // Generate post pages
        for post in &posts {
            self.generate_post_page(post).await?;
            
            // Generate translation pages
            if let Some(ref translations) = post.translations {
                for translation in translations {
                    self.generate_translation_page(post, translation).await?;
                }
            }
        }

        // Generate PDS page
        self.generate_pds_page().await?;

        // Generate Game page
        self.generate_game_page().await?;

        println!("{} {} posts", "Generated".cyan(), posts.len());

        Ok(())
    }

    fn copy_static_files(&self) -> Result<()> {
        let static_dir = self.base_path.join("static");
        let public_dir = self.base_path.join("public");

        if static_dir.exists() {
            for entry in WalkDir::new(&static_dir).min_depth(1) {
                let entry = entry?;
                let path = entry.path();
                let relative_path = path.strip_prefix(&static_dir)?;
                let dest_path = public_dir.join(relative_path);

                if path.is_dir() {
                    fs::create_dir_all(&dest_path)?;
                } else {
                    if let Some(parent) = dest_path.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    fs::copy(path, &dest_path)?;
                }
            }
            
            // Copy files from atproto-auth-widget dist (if available)
            let widget_dist = self.base_path.join("atproto-auth-widget/dist");
            if widget_dist.exists() {
                for entry in WalkDir::new(&widget_dist).min_depth(1) {
                    let entry = entry?;
                    let path = entry.path();
                    let relative_path = path.strip_prefix(&widget_dist)?;
                    let dest_path = public_dir.join(relative_path);

                    if path.is_dir() {
                        fs::create_dir_all(&dest_path)?;
                    } else {
                        if let Some(parent) = dest_path.parent() {
                            fs::create_dir_all(parent)?;
                        }
                        fs::copy(path, &dest_path)?;
                    }
                }
                println!("{} widget files from dist", "Copied".yellow());
            }
            
            // Handle client-metadata.json based on environment (fallback)
            let is_production = std::env::var("PRODUCTION").unwrap_or_default() == "true";
            let metadata_dest = public_dir.join("client-metadata.json");
            
            // First try to get from widget dist (preferred)
            let widget_metadata = widget_dist.join("client-metadata.json");
            if widget_metadata.exists() {
                fs::copy(&widget_metadata, &metadata_dest)?;
                println!("{} client-metadata.json from widget", "Using".yellow());
            } else if is_production {
                // Fallback to local static files
                let prod_metadata = static_dir.join("client-metadata-prod.json");
                if prod_metadata.exists() {
                    fs::copy(&prod_metadata, &metadata_dest)?;
                    println!("{} production client-metadata.json (fallback)", "Using".yellow());
                }
            }
            
            println!("{} static files", "Copied".cyan());
        }

        Ok(())
    }

    async fn process_posts(&self) -> Result<Vec<Post>> {
        let mut posts = Vec::new();
        let posts_dir = self.base_path.join("content/posts");

        if posts_dir.exists() {
            for entry in WalkDir::new(&posts_dir).min_depth(1) {
                let entry = entry?;
                let path = entry.path();

                if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                    match self.process_single_post(path).await {
                        Ok(post) => posts.push(post),
                        Err(e) => eprintln!("Error processing {}: {}", path.display(), e),
                    }
                }
            }
        }

        // Sort posts by date (newest first)
        posts.sort_by(|a, b| b.date.cmp(&a.date));

        Ok(posts)
    }

    async fn process_single_post(&self, path: &std::path::Path) -> Result<Post> {
        let content = fs::read_to_string(path)?;
        let (frontmatter, mut content) = self.markdown_processor.parse_frontmatter(&content)?;
        
        // Apply AI enhancements if enabled
        if let Some(ref ai_manager) = self.ai_manager {
            // Enhance content with AI
            let title = frontmatter.get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled");
            
            content = ai_manager.enhance_content(&content, title).await
                .unwrap_or_else(|e| {
                    eprintln!("AI enhancement failed: {}", e);
                    content
                });
        }
        
        let html_content = self.markdown_processor.render(&content)?;
        
        // Use filename (without extension) as URL slug to include date
        let filename_slug = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("post")
            .to_string();
            
        // Still keep the slug field from frontmatter for other purposes
        let frontmatter_slug = frontmatter.get("slug")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| filename_slug.clone());

        let mut post = Post {
            title: frontmatter.get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled")
                .to_string(),
            date: frontmatter.get("date")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            content: html_content,
            slug: frontmatter_slug.clone(),
            filename_slug: filename_slug.clone(),
            url: format!("/posts/{}.html", filename_slug),
            tags: frontmatter.get("tags")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter()
                    .filter_map(|v| v.as_str())
                    .map(|s| s.to_string())
                    .collect())
                .unwrap_or_default(),
            translations: None,
            ai_comment: None,
            extra: frontmatter.get("extra").cloned(),
        };
        
        // Auto-translate if enabled and post is in Japanese
        if let Some(ref ai_manager) = self.ai_manager {
            if self.config.ai.as_ref().map_or(false, |ai| ai.auto_translate) 
                && self.config.site.language == "ja" {
                
                match ai_manager.translate(&content, "ja", "en").await {
                    Ok(translated_content) => {
                        let translated_html = self.markdown_processor.render(&translated_content)?;
                        let translated_title = ai_manager.translate(&post.title, "ja", "en").await
                            .unwrap_or_else(|_| post.title.clone());
                        
                        post.translations = Some(vec![Translation {
                            lang: "en".to_string(),
                            title: translated_title,
                            content: translated_html,
                            url: format!("/posts/{}-en.html", post.filename_slug),
                        }]);
                    }
                    Err(e) => eprintln!("Translation failed: {}", e),
                }
            }
            
            // Generate AI comment
            if self.config.ai.as_ref().map_or(false, |ai| ai.comment_moderation) {
                match ai_manager.generate_comment(&post.title, &content).await {
                    Ok(Some(comment)) => {
                        post.ai_comment = Some(comment.content);
                    }
                    Ok(None) => {}
                    Err(e) => eprintln!("AI comment generation failed: {}", e),
                }
            }
        }

        Ok(post)
    }

    async fn generate_index(&self, posts: &[Post]) -> Result<()> {
        // Enhance posts with additional metadata for timeline view
        let enhanced_posts: Vec<serde_json::Value> = posts.iter().map(|post| {
            let excerpt = self.extract_excerpt(&post.content);
            let markdown_url = format!("/posts/{}.md", post.filename_slug);
            let translation_url = if let Some(ref translations) = post.translations {
                translations.first().map(|t| t.url.clone())
            } else {
                None
            };
            
            serde_json::json!({
                "title": post.title,
                "date": post.date,
                "content": post.content,
                "slug": post.slug,
                "url": post.url,
                "tags": post.tags,
                "excerpt": excerpt,
                "markdown_url": markdown_url,
                "translation_url": translation_url,
                "language": self.config.site.language
            })
        }).collect();
        
        let mut context = tera::Context::new();
        let config_with_timestamp = self.create_config_with_timestamp()?;
        context.insert("config", &config_with_timestamp);
        context.insert("posts", &enhanced_posts);
        
        let html = self.template_engine.render("index.html", &context)?;
        
        let output_path = self.base_path.join("public/index.html");
        fs::write(output_path, html)?;

        Ok(())
    }

    async fn generate_post_page(&self, post: &Post) -> Result<()> {
        let mut context = tera::Context::new();
        let config_with_timestamp = self.create_config_with_timestamp()?;
        context.insert("config", &config_with_timestamp);
        
        // Create enhanced post with additional URLs
        let mut enhanced_post = post.clone();
        enhanced_post.url = format!("/posts/{}.html", post.filename_slug);
        
        // Add markdown view URL
        let markdown_url = format!("/posts/{}.md", post.filename_slug);
        
        // Add translation URLs if available
        let translation_urls: Vec<String> = if let Some(ref translations) = post.translations {
            translations.iter().map(|t| t.url.clone()).collect()
        } else {
            Vec::new()
        };
        
        context.insert("post", &serde_json::json!({
            "title": enhanced_post.title,
            "date": enhanced_post.date,
            "content": enhanced_post.content,
            "slug": enhanced_post.slug,
            "url": enhanced_post.url,
            "tags": enhanced_post.tags,
            "ai_comment": enhanced_post.ai_comment,
            "markdown_url": markdown_url,
            "translation_url": translation_urls.first(),
            "language": self.config.site.language,
            "extra": enhanced_post.extra
        }));

        let html = self.template_engine.render_with_context("post.html", &context)?;
        
        let output_dir = self.base_path.join("public/posts");
        fs::create_dir_all(&output_dir)?;
        
        let output_path = output_dir.join(format!("{}.html", post.filename_slug));
        fs::write(output_path, html)?;
        
        // Generate markdown view
        self.generate_markdown_view(post).await?;

        Ok(())
    }
    
    async fn generate_translation_page(&self, post: &Post, translation: &Translation) -> Result<()> {
        let mut context = tera::Context::new();
        let config_with_timestamp = self.create_config_with_timestamp()?;
        context.insert("config", &config_with_timestamp);
        context.insert("post", &TranslatedPost {
            title: translation.title.clone(),
            date: post.date.clone(),
            content: translation.content.clone(),
            slug: post.slug.clone(),
            url: translation.url.clone(),
            tags: post.tags.clone(),
            original_url: post.url.clone(),
            lang: translation.lang.clone(),
        });

        let html = self.template_engine.render_with_context("post.html", &context)?;
        
        let output_dir = self.base_path.join("public/posts");
        fs::create_dir_all(&output_dir)?;
        
        let output_path = output_dir.join(format!("{}-{}.html", post.filename_slug, translation.lang));
        fs::write(output_path, html)?;

        Ok(())
    }
    
    fn extract_excerpt(&self, html_content: &str) -> String {
        // Simple excerpt extraction - take first 200 characters of text content
        let text_content = html_content
            .replace("<p>", "")
            .replace("</p>", " ")
            .replace("<br>", " ")
            .replace("<br/>", " ");
        
        // Remove HTML tags with a simple regex-like approach
        let mut text = String::new();
        let mut in_tag = false;
        for ch in text_content.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => text.push(ch),
                _ => {}
            }
        }
        
        let excerpt = text.trim().chars().take(200).collect::<String>();
        if text.len() > 200 {
            format!("{}...", excerpt)
        } else {
            excerpt
        }
    }
    
    async fn generate_markdown_view(&self, post: &Post) -> Result<()> {
        // Find original markdown file
        let posts_dir = self.base_path.join("content/posts");
        
        // Try to find the markdown file by checking all files in posts directory
        for entry in fs::read_dir(&posts_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if let Some(extension) = path.extension() {
                if extension == "md" {
                    let content = fs::read_to_string(&path)?;
                    let (frontmatter, _) = self.markdown_processor.parse_frontmatter(&content)?;
                    
                    // Check if this file has the same slug
                    let file_slug = frontmatter.get("slug")
                        .and_then(|v| v.as_str())
                        .unwrap_or_else(|| {
                            path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("")
                        });
                    
                    if file_slug == post.slug || path.file_stem().and_then(|s| s.to_str()).unwrap_or("") == post.filename_slug {
                        let output_dir = self.base_path.join("public/posts");
                        fs::create_dir_all(&output_dir)?;
                        
                        let output_path = output_dir.join(format!("{}.md", post.filename_slug));
                        fs::write(output_path, content)?;
                        break;
                    }
                }
            }
        }
        
        Ok(())
    }

    async fn generate_json_index(&self, posts: &[Post]) -> Result<()> {
        let index_data: Vec<serde_json::Value> = posts.iter().map(|post| {
            // Parse date for proper formatting
            let parsed_date = chrono::NaiveDate::parse_from_str(&post.date, "%Y-%m-%d")
                .unwrap_or_else(|_| chrono::Utc::now().naive_utc().date());
            
            // Format to Hugo-style date format (Mon Jan 2, 2006)
            let formatted_date = parsed_date.format("%a %b %-d, %Y").to_string();
            
            // Create UTC datetime for utc_time field  
            let utc_datetime = parsed_date.and_hms_opt(0, 0, 0)
                .unwrap_or_else(|| chrono::Utc::now().naive_utc());
            let utc_time = format!("{}Z", utc_datetime.format("%Y-%m-%dT%H:%M:%S"));
            
            // Extract plain text content from HTML
            let contents = self.extract_plain_text(&post.content);
            
            serde_json::json!({
                "title": post.title,
                "tags": post.tags,
                "description": self.extract_excerpt(&post.content),
                "categories": [],
                "contents": contents,
                "href": format!("{}{}", self.config.site.base_url.trim_end_matches('/'), post.url),
                "utc_time": utc_time,
                "formated_time": formatted_date
            })
        }).collect();
        
        // Write JSON index to public directory
        let output_path = self.base_path.join("public/index.json");
        let json_content = serde_json::to_string_pretty(&index_data)?;
        fs::write(output_path, json_content)?;
        
        println!("{} JSON index with {} posts", "Generated".cyan(), posts.len());
        
        Ok(())
    }
    
    async fn generate_pds_page(&self) -> Result<()> {
        let public_dir = self.base_path.join("public");
        let pds_dir = public_dir.join("pds");
        fs::create_dir_all(&pds_dir)?;
        
        // Generate PDS page using the pds.html template
        let config_with_timestamp = self.create_config_with_timestamp()?;
        let mut context = tera::Context::new();
        context.insert("config", &config_with_timestamp);
        context.insert("site", &self.config.site);
        context.insert("page", &serde_json::json!({
            "title": "AT URI Browser",
            "description": "AT Protocol レコードをブラウズし、分散SNSのコンテンツを探索できます"
        }));
        
        let rendered_content = self.template_engine.render("pds.html", &context)?;
        let output_path = pds_dir.join("index.html");
        fs::write(output_path, rendered_content)?;
        
        println!("{} PDS page", "Generated".cyan());
        
        Ok(())
    }

    async fn generate_game_page(&self) -> Result<()> {
        let public_dir = self.base_path.join("public");
        let game_dir = public_dir.join("game");
        fs::create_dir_all(&game_dir)?;
        
        // Generate Game page using the game.html template
        let config_with_timestamp = self.create_config_with_timestamp()?;
        let mut context = tera::Context::new();
        context.insert("config", &config_with_timestamp);
        context.insert("site", &self.config.site);
        context.insert("page", &serde_json::json!({
            "title": "Game",
            "description": "Play the game with AT Protocol authentication"
        }));
        
        let rendered_content = self.template_engine.render("game.html", &context)?;
        let output_path = game_dir.join("index.html");
        fs::write(output_path, rendered_content)?;
        
        println!("{} Game page", "Generated".cyan());
        
        Ok(())
    }
    
    fn extract_plain_text(&self, html_content: &str) -> String {
        // Remove HTML tags and extract plain text
        let mut text = String::new();
        let mut in_tag = false;
        
        for ch in html_content.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => text.push(ch),
                _ => {}
            }
        }
        
        // Clean up whitespace
        text.split_whitespace().collect::<Vec<_>>().join(" ")
    }
}

#[derive(Debug, Clone, serde::Serialize)]
struct TranslatedPost {
    pub title: String,
    pub date: String,
    pub content: String,
    pub slug: String,
    pub url: String,
    pub tags: Vec<String>,
    pub original_url: String,
    pub lang: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Post {
    pub title: String,
    pub date: String,
    pub content: String,
    pub slug: String,
    pub filename_slug: String, // Added for URL generation
    pub url: String,
    pub tags: Vec<String>,
    pub translations: Option<Vec<Translation>>,
    pub ai_comment: Option<String>,
    pub extra: Option<serde_json::Value>,
}


#[derive(Debug, Clone, serde::Serialize)]
pub struct Translation {
    pub lang: String,
    pub title: String,
    pub content: String,
    pub url: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[allow(dead_code)]
struct BlogPost {
    title: String,
    url: String,
    date: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[allow(dead_code)]
struct BlogIndex {
    posts: Vec<BlogPost>,
}

