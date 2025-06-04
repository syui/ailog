use anyhow::Result;
use colored::Colorize;
use std::fs;
use std::path::PathBuf;

pub async fn execute(path: PathBuf) -> Result<()> {
    println!("{}", "Initializing new blog...".green());

    // Create directory structure
    let dirs = vec![
        "content",
        "content/posts",
        "templates",
        "static",
        "static/css",
        "static/js",
        "static/images",
        "public",
    ];

    for dir in dirs {
        let dir_path = path.join(dir);
        fs::create_dir_all(&dir_path)?;
        println!("  {} {}", "Created".cyan(), dir_path.display());
    }

    // Create default config
    let config_content = r#"[site]
title = "My Blog"
description = "A blog powered by ailog"
base_url = "https://example.com"
language = "ja"

[build]
highlight_code = true
minify = false

[ai]
enabled = false
auto_translate = false
comment_moderation = false
"#;

    fs::write(path.join("config.toml"), config_content)?;
    println!("  {} config.toml", "Created".cyan());

    // Create default template
    let base_template = r#"<!DOCTYPE html>
<html lang="{{ config.language }}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}{{ config.title }}{% endblock %}</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header>
        <h1><a href="/">{{ config.title }}</a></h1>
        <p>{{ config.description }}</p>
    </header>
    
    <main>
        {% block content %}{% endblock %}
    </main>
    
    <footer>
        <p>&copy; 2025 {{ config.title }}</p>
    </footer>
</body>
</html>"#;

    fs::write(path.join("templates/base.html"), base_template)?;
    println!("  {} templates/base.html", "Created".cyan());

    let index_template = r#"{% extends "base.html" %}

{% block content %}
<h2>Recent Posts</h2>
<ul class="post-list">
    {% for post in posts %}
    <li>
        <a href="{{ post.url }}">{{ post.title }}</a>
        <time>{{ post.date }}</time>
    </li>
    {% endfor %}
</ul>
{% endblock %}"#;

    fs::write(path.join("templates/index.html"), index_template)?;
    println!("  {} templates/index.html", "Created".cyan());

    let post_template = r#"{% extends "base.html" %}

{% block title %}{{ post.title }} - {{ config.title }}{% endblock %}

{% block content %}
<article>
    <h1>{{ post.title }}</h1>
    <time>{{ post.date }}</time>
    <div class="content">
        {{ post.content | safe }}
    </div>
</article>
{% endblock %}"#;

    fs::write(path.join("templates/post.html"), post_template)?;
    println!("  {} templates/post.html", "Created".cyan());

    // Create default CSS
    let css_content = r#"body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
}

header {
    margin-bottom: 40px;
    border-bottom: 1px solid #eee;
    padding-bottom: 20px;
}

header h1 {
    margin: 0;
}

header h1 a {
    color: #333;
    text-decoration: none;
}

.post-list {
    list-style: none;
    padding: 0;
}

.post-list li {
    margin-bottom: 15px;
}

.post-list time {
    color: #666;
    font-size: 0.9em;
    margin-left: 10px;
}

article time {
    color: #666;
    display: block;
    margin-bottom: 20px;
}

pre {
    background-color: #f4f4f4;
    padding: 15px;
    border-radius: 5px;
    overflow-x: auto;
}

code {
    background-color: #f4f4f4;
    padding: 2px 5px;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', monospace;
}"#;

    fs::write(path.join("static/css/style.css"), css_content)?;
    println!("  {} static/css/style.css", "Created".cyan());

    // Create sample post
    let sample_post = r#"---
title: "Welcome to ailog"
date: 2025-01-06
tags: ["welcome", "ailog"]
---

# Welcome to ailog

This is your first post powered by **ailog** - a static blog generator with AI features.

## Features

- Fast static site generation
- Markdown support with frontmatter
- AI-powered features (coming soon)
- atproto integration for comments

## Getting Started

Create new posts with:

```bash
ailog new "My New Post"
```

Build your blog with:

```bash
ailog build
```

Happy blogging!"#;

    fs::write(path.join("content/posts/welcome.md"), sample_post)?;
    println!("  {} content/posts/welcome.md", "Created".cyan());

    println!("\n{}", "Blog initialized successfully!".green().bold());
    println!("\nNext steps:");
    println!("  1. cd {}", path.display());
    println!("  2. ailog build");
    println!("  3. ailog serve");

    Ok(())
}