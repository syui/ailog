use anyhow::Result;
use chrono::Local;
use colored::Colorize;
use std::fs;
use std::path::PathBuf;

pub async fn execute(title: String, format: String) -> Result<()> {
    println!("{} {}", "Creating new post:".green(), title);

    let date = Local::now();
    let filename = format!(
        "{}-{}.{}",
        date.format("%Y-%m-%d"),
        title.to_lowercase().replace(' ', "-"),
        format
    );

    let content = format!(
        r#"---
title: "{}"
date: {}
tags: []
draft: false
---

# {}

Write your content here...
"#,
        title,
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