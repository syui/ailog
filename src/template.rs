use anyhow::Result;
use tera::{Tera, Context};
use std::path::PathBuf;
use crate::config::Config;
use crate::generator::Post;

pub struct TemplateEngine {
    tera: Tera,
}

impl TemplateEngine {
    pub fn new(template_dir: PathBuf) -> Result<Self> {
        let pattern = format!("{}/**/*.html", template_dir.display());
        let tera = Tera::new(&pattern)?;
        
        Ok(Self { tera })
    }

    pub fn create_context(&self, config: &Config, posts: &[Post]) -> Result<Context> {
        let mut context = Context::new();
        context.insert("config", &config.site);
        context.insert("posts", posts);
        Ok(context)
    }

    pub fn render(&self, template: &str, context: &Context) -> Result<String> {
        let output = self.tera.render(template, context)?;
        Ok(output)
    }

    pub fn render_with_context(&self, template: &str, context: &Context) -> Result<String> {
        let output = self.tera.render(template, context)?;
        Ok(output)
    }
}