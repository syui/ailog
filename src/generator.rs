use anyhow::Result;
use colored::Colorize;
use std::path::PathBuf;
use walkdir::WalkDir;
use std::fs;
use crate::config::Config;
use crate::markdown::MarkdownProcessor;
use crate::template::TemplateEngine;

pub struct Generator {
    base_path: PathBuf,
    config: Config,
    markdown_processor: MarkdownProcessor,
    template_engine: TemplateEngine,
}

impl Generator {
    pub fn new(base_path: PathBuf, config: Config) -> Result<Self> {
        let markdown_processor = MarkdownProcessor::new(config.build.highlight_code);
        let template_engine = TemplateEngine::new(base_path.join("templates"))?;

        Ok(Self {
            base_path,
            config,
            markdown_processor,
            template_engine,
        })
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

        // Generate post pages
        for post in &posts {
            self.generate_post_page(post).await?;
        }

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
        let (frontmatter, content) = self.markdown_processor.parse_frontmatter(&content)?;
        
        let html_content = self.markdown_processor.render(&content)?;
        
        let slug = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("post")
            .to_string();

        let post = Post {
            title: frontmatter.get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled")
                .to_string(),
            date: frontmatter.get("date")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            content: html_content,
            slug: slug.clone(),
            url: format!("/posts/{}.html", slug),
            tags: frontmatter.get("tags")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter()
                    .filter_map(|v| v.as_str())
                    .map(|s| s.to_string())
                    .collect())
                .unwrap_or_default(),
        };

        Ok(post)
    }

    async fn generate_index(&self, posts: &[Post]) -> Result<()> {
        let context = self.template_engine.create_context(&self.config, posts)?;
        let html = self.template_engine.render("index.html", &context)?;
        
        let output_path = self.base_path.join("public/index.html");
        fs::write(output_path, html)?;

        Ok(())
    }

    async fn generate_post_page(&self, post: &Post) -> Result<()> {
        let mut context = tera::Context::new();
        context.insert("config", &self.config.site);
        context.insert("post", post);

        let html = self.template_engine.render_with_context("post.html", &context)?;
        
        let output_dir = self.base_path.join("public/posts");
        fs::create_dir_all(&output_dir)?;
        
        let output_path = output_dir.join(format!("{}.html", post.slug));
        fs::write(output_path, html)?;

        Ok(())
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Post {
    pub title: String,
    pub date: String,
    pub content: String,
    pub slug: String,
    pub url: String,
    pub tags: Vec<String>,
}