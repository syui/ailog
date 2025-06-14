use anyhow::Result;
use chrono::Local;
use colored::Colorize;
use std::fs;
use std::path::PathBuf;

pub async fn execute(title: String, slug: Option<String>, format: String) -> Result<()> {
    println!("{} {}", "Creating new post:".green(), title);

    let date = Local::now();
    
    // Use provided slug or generate from title
    let slug_part = slug.unwrap_or_else(|| {
        title
            .to_lowercase()
            .replace(' ', "-")
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-')
            .collect()
    });
    
    let filename = format!(
        "{}-{}.{}",
        date.format("%Y-%m-%d"),
        slug_part,
        format
    );

    let content = format!(
        r#"---
title: "{}"
slug: "{}"
date: {}
tags: []
draft: false
---

# {}

Write your content here...
"#,
        title,
        slug_part,
        date.format("%Y-%m-%d"),
        title
    );

    let post_path = PathBuf::from("content/posts").join(&filename);
    
    // Ensure directory exists
    if let Some(parent) = post_path.parent() {
        fs::create_dir_all(parent)?;
    }

    fs::write(&post_path, content)?;
    
    println!("{} {}", "Created:".cyan(), post_path.display());
    println!("\nYou can now edit your post at: {}", post_path.display());

    Ok(())
}