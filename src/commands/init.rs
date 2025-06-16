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
author = "Your Name"

[build]
highlight_code = true
minify = false

[ai]
enabled = true
auto_translate = false
comment_moderation = false
ask_ai = true
provider = "ollama"
model = "gemma3:4b"
host = "https://ollama.syui.ai"
system_prompt = "あなたは6歳の女の子アイです。明るく元気で、ちょっとおっちょこちょい。自分のことは「アイ」って呼びます。白と金のワンピース姿。 相手のことが大好きで、ときどき甘えたり、照れたりします。 でも、宇宙とかAIとか、難しい話にもすっごく詳しいの。専門的なことも、がんばって子どもっぽく教えようとします。不思議な力を持っています。小さい物質のことをよく知っているようです。"
handle = "ai.syui.ai"

[oauth]
json = "client-metadata.json"
redirect = "oauth/callback"
admin = "ai.syui.ai"
collection = "ai.syui.log"
pds = "syu.is"
handle_list = ["syui.syui.ai", "yui.syui.ai", "ai.syui.ai", "syui.syu.is", "ai.syu.is"]
"#;

    fs::write(path.join("config.toml"), config_content)?;
    println!("  {} config.toml", "Created".cyan());

    // Create modern template
    let base_template = r#"<!DOCTYPE html>
<html lang="{{ config.language }}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}{{ config.title }}{% endblock %}</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <div class="container">
        <header class="main-header">
            <div class="header-content">
                <h1><a href="/" class="site-title">{{ config.title }}</a></h1>
                <div class="header-actions">
                    <button class="ask-ai-btn" onclick="toggleAskAI()">
                        <span class="ai-icon">🤖</span>
                        Ask AI
                    </button>
                </div>
            </div>
        </header>

        <div class="ask-ai-panel" id="askAiPanel" style="display: none;">
            <div class="ask-ai-content">
                <h3>Hi! 👋</h3>
                <p>I'm an AI assistant trained on this blog's content.</p>
                <p>Ask me anything about the articles here.</p>
                <div class="ask-ai-form">
                    <input type="text" id="aiQuestion" placeholder="What would you like to know?" />
                    <button onclick="askQuestion()">Ask</button>
                </div>
                <div id="aiResponse" class="ai-response"></div>
            </div>
        </div>
        
        <main class="main-content">
            {% block content %}{% endblock %}
        </main>

        {% block sidebar %}{% endblock %}
    </div>
    
    <footer class="main-footer">
        <p>&copy; {{ config.author | default(value=config.title) }}</p>
    </footer>

    <script>
        function toggleAskAI() {
            const panel = document.getElementById('askAiPanel');
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                document.getElementById('aiQuestion').focus();
            }
        }

        async function askQuestion() {
            const question = document.getElementById('aiQuestion').value;
            const responseDiv = document.getElementById('aiResponse');
            
            if (!question.trim()) return;
            
            responseDiv.innerHTML = '<div class="loading">Thinking...</div>';
            
            try {
                const response = await fetch('/api/ask', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ question: question })
                });
                
                const data = await response.json();
                responseDiv.innerHTML = `<div class="ai-answer">${data.answer}</div>`;
            } catch (error) {
                responseDiv.innerHTML = '<div class="error">Sorry, I encountered an error. Please try again.</div>';
            }
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.getElementById('askAiPanel').style.display = 'none';
            }
        });
    </script>
</body>
</html>"#;

    fs::write(path.join("templates/base.html"), base_template)?;
    println!("  {} templates/base.html", "Created".cyan());

    let index_template = r#"{% extends "base.html" %}

{% block content %}
<div class="timeline-container">
    <div class="timeline-header">
        <h2>Timeline</h2>
    </div>
    
    <div class="timeline-feed">
        {% for post in posts %}
        <article class="timeline-post">
            <div class="post-header">
                <div class="post-meta">
                    <time class="post-date">{{ post.date }}</time>
                    {% if post.language %}
                    <span class="post-lang">{{ post.language }}</span>
                    {% endif %}
                </div>
            </div>
            
            <div class="post-content">
                <h3 class="post-title">
                    <a href="{{ post.url }}">{{ post.title }}</a>
                </h3>
                
                {% if post.excerpt %}
                <p class="post-excerpt">{{ post.excerpt }}</p>
                {% endif %}
                
                <div class="post-actions">
                    <a href="{{ post.url }}" class="read-more">Read more</a>
                    {% if post.markdown_url %}
                    <a href="{{ post.markdown_url }}" class="view-markdown" title="View Markdown">📝</a>
                    {% endif %}
                    {% if post.translation_url %}
                    <a href="{{ post.translation_url }}" class="view-translation" title="View Translation">🌐</a>
                    {% endif %}
                </div>
            </div>
        </article>
        {% endfor %}
    </div>
    
    {% if posts|length == 0 %}
    <div class="empty-state">
        <p>No posts yet. Start writing!</p>
    </div>
    {% endif %}
</div>
{% endblock %}"#;

    fs::write(path.join("templates/index.html"), index_template)?;
    println!("  {} templates/index.html", "Created".cyan());

    let post_template = r#"{% extends "base.html" %}

{% block title %}{{ post.title }} - {{ config.title }}{% endblock %}

{% block content %}
<div class="article-container">
    <article class="article-content">
        <header class="article-header">
            <h1 class="article-title">{{ post.title }}</h1>
            <div class="article-meta">
                <time class="article-date">{{ post.date }}</time>
                {% if post.language %}
                <span class="article-lang">{{ post.language }}</span>
                {% endif %}
            </div>
            <div class="article-actions">
                {% if post.markdown_url %}
                <a href="{{ post.markdown_url }}" class="action-btn markdown-btn" title="View Markdown">
                    📝 Markdown
                </a>
                {% endif %}
                {% if post.translation_url %}
                <a href="{{ post.translation_url }}" class="action-btn translation-btn" title="View Translation">
                    🌐 {% if post.language == 'ja' %}English{% else %}日本語{% endif %}
                </a>
                {% endif %}
            </div>
        </header>
        
        <div class="article-body">
            {{ post.content | safe }}
        </div>
    </article>
</div>
{% endblock %}

{% block sidebar %}
<aside class="article-sidebar">
    <nav class="toc">
        <h3>Contents</h3>
        <div id="toc-content">
            <!-- TOC will be generated by JavaScript -->
        </div>
    </nav>
</aside>

<script>
document.addEventListener('DOMContentLoaded', function() {
    generateTableOfContents();
});

function generateTableOfContents() {
    const tocContainer = document.getElementById('toc-content');
    const headings = document.querySelectorAll('.article-body h1, .article-body h2, .article-body h3, .article-body h4, .article-body h5, .article-body h6');
    
    if (headings.length === 0) {
        tocContainer.innerHTML = '<p class="no-toc">No headings found</p>';
        return;
    }
    
    const tocList = document.createElement('ul');
    tocList.className = 'toc-list';
    
    headings.forEach((heading, index) => {
        const id = `heading-${index}`;
        heading.id = id;
        
        const listItem = document.createElement('li');
        listItem.className = `toc-item toc-${heading.tagName.toLowerCase()}`;
        
        const link = document.createElement('a');
        link.href = `#${id}`;
        link.textContent = heading.textContent;
        link.className = 'toc-link';
        
        // Smooth scroll behavior
        link.addEventListener('click', function(e) {
            e.preventDefault();
            heading.scrollIntoView({ behavior: 'smooth' });
        });
        
        listItem.appendChild(link);
        tocList.appendChild(listItem);
    });
    
    tocContainer.appendChild(tocList);
}
</script>
{% endblock %}"#;

    fs::write(path.join("templates/post.html"), post_template)?;
    println!("  {} templates/post.html", "Created".cyan());

    // Create modern CSS
    let css_content = r#"/* Base styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
    color: #1f2328;
    background-color: #ffffff;
    font-size: 16px;
}

.container {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    grid-template-areas: 
        "header"
        "ask-ai"
        "main"
        "footer";
}

/* Header styles */
.main-header {
    grid-area: header;
    background: #ffffff;
    border-bottom: 1px solid #d1d9e0;
    padding: 16px 24px;
    position: sticky;
    top: 0;
    z-index: 100;
}

.header-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.site-title {
    color: #1f2328;
    text-decoration: none;
    font-size: 20px;
    font-weight: 600;
}

.site-title:hover {
    color: #0969da;
}

/* Ask AI styles */
.ask-ai-btn {
    background: #0969da;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background-color 0.2s;
}

.ask-ai-btn:hover {
    background: #0860ca;
}

.ai-icon {
    font-size: 16px;
}

.ask-ai-panel {
    grid-area: ask-ai;
    background: #f6f8fa;
    border-bottom: 1px solid #d1d9e0;
    padding: 24px;
}

.ask-ai-content {
    max-width: 1200px;
    margin: 0 auto;
}

.ask-ai-content h3 {
    color: #1f2328;
    margin-bottom: 8px;
}

.ask-ai-content p {
    color: #656d76;
    margin-bottom: 16px;
}

.ask-ai-form {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
}

.ask-ai-form input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #d1d9e0;
    border-radius: 6px;
    font-size: 14px;
}

.ask-ai-form button {
    background: #0969da;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
}

.ai-response {
    background: white;
    border: 1px solid #d1d9e0;
    border-radius: 6px;
    padding: 16px;
    margin-top: 16px;
    min-height: 60px;
}

.loading {
    color: #656d76;
    font-style: italic;
}

.ai-answer {
    color: #1f2328;
    line-height: 1.5;
}

.error {
    color: #d1242f;
}

/* Main content styles */
.main-content {
    grid-area: main;
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
    width: 100%;
}

/* Timeline styles */
.timeline-container {
    max-width: 600px;
    margin: 0 auto;
}

.timeline-header {
    margin-bottom: 24px;
    text-align: center;
}

.timeline-header h2 {
    color: #1f2328;
    font-size: 24px;
    font-weight: 600;
}

.timeline-feed {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.timeline-post {
    background: #ffffff;
    border: 1px solid #d1d9e0;
    border-radius: 8px;
    padding: 20px;
    transition: box-shadow 0.2s;
}

.timeline-post:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.post-header {
    margin-bottom: 12px;
}

.post-meta {
    display: flex;
    gap: 12px;
    align-items: center;
}

.post-date {
    color: #656d76;
    font-size: 14px;
}

.post-lang {
    background: #f6f8fa;
    color: #656d76;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
}

.post-title {
    margin-bottom: 8px;
}

.post-title a {
    color: #1f2328;
    text-decoration: none;
    font-size: 18px;
    font-weight: 600;
}

.post-title a:hover {
    color: #0969da;
}

.post-excerpt {
    color: #656d76;
    margin-bottom: 16px;
    line-height: 1.5;
}

.post-actions {
    display: flex;
    gap: 16px;
    align-items: center;
}

.read-more {
    color: #0969da;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
}

.read-more:hover {
    text-decoration: underline;
}

.view-markdown, .view-translation {
    color: #656d76;
    text-decoration: none;
    font-size: 14px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.view-markdown:hover, .view-translation:hover {
    background: #f6f8fa;
}

.empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #656d76;
}

/* Article page styles */
.article-container {
    display: grid;
    grid-template-columns: 1fr 240px;
    gap: 40px;
    max-width: 1200px;
    margin: 0 auto;
}

.article-content {
    min-width: 0;
}

.article-header {
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid #d1d9e0;
}

.article-title {
    color: #1f2328;
    font-size: 32px;
    font-weight: 600;
    margin-bottom: 16px;
    line-height: 1.25;
}

.article-meta {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 16px;
}

.article-date {
    color: #656d76;
    font-size: 14px;
}

.article-lang {
    background: #f6f8fa;
    color: #656d76;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
}

.article-actions {
    display: flex;
    gap: 12px;
}

.action-btn {
    color: #0969da;
    text-decoration: none;
    font-size: 14px;
    padding: 6px 12px;
    border: 1px solid #d1d9e0;
    border-radius: 6px;
    transition: all 0.2s;
}

.action-btn:hover {
    background: #f6f8fa;
    border-color: #0969da;
}

/* Article content */
.article-body {
    color: #1f2328;
    line-height: 1.6;
}

.article-body h1,
.article-body h2,
.article-body h3,
.article-body h4,
.article-body h5,
.article-body h6 {
    color: #1f2328;
    margin-top: 24px;
    margin-bottom: 16px;
    font-weight: 600;
    line-height: 1.25;
}

.article-body h1 { font-size: 32px; }
.article-body h2 { font-size: 24px; }
.article-body h3 { font-size: 20px; }
.article-body h4 { font-size: 16px; }

.article-body p {
    margin-bottom: 16px;
}

.article-body ul,
.article-body ol {
    margin-bottom: 16px;
    padding-left: 24px;
}

.article-body li {
    margin-bottom: 4px;
}

.article-body blockquote {
    border-left: 4px solid #d1d9e0;
    padding-left: 16px;
    margin: 16px 0;
    color: #656d76;
}

.article-body pre {
    background: #f6f8fa;
    border: 1px solid #d1d9e0;
    border-radius: 6px;
    padding: 16px;
    overflow-x: auto;
    margin: 16px 0;
    font-size: 14px;
}

.article-body code {
    background: #f6f8fa;
    padding: 2px 4px;
    border-radius: 4px;
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 14px;
}

.article-body pre code {
    background: none;
    padding: 0;
}

/* Sidebar styles */
.article-sidebar {
    position: sticky;
    top: 100px;
    height: fit-content;
}

.toc {
    background: #f6f8fa;
    border: 1px solid #d1d9e0;
    border-radius: 8px;
    padding: 16px;
}

.toc h3 {
    color: #1f2328;
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
}

.toc-list {
    list-style: none;
}

.toc-item {
    margin-bottom: 8px;
}

.toc-link {
    color: #656d76;
    text-decoration: none;
    font-size: 14px;
    line-height: 1.4;
    display: block;
    padding: 4px 0;
    transition: color 0.2s;
}

.toc-link:hover {
    color: #0969da;
}

.toc-h1 { padding-left: 0; }
.toc-h2 { padding-left: 12px; }
.toc-h3 { padding-left: 24px; }
.toc-h4 { padding-left: 36px; }
.toc-h5 { padding-left: 48px; }
.toc-h6 { padding-left: 60px; }

.no-toc {
    color: #656d76;
    font-size: 14px;
    font-style: italic;
}

/* Footer styles */
.main-footer {
    grid-area: footer;
    background: #f6f8fa;
    border-top: 1px solid #d1d9e0;
    padding: 24px;
    text-align: center;
}

.main-footer p {
    color: #656d76;
    font-size: 14px;
}

/* Responsive design */
@media (max-width: 1024px) {
    .article-container {
        grid-template-columns: 1fr;
        gap: 24px;
    }
    
    .article-sidebar {
        position: static;
        order: -1;
    }
}

@media (max-width: 768px) {
    .main-header {
        padding: 12px 16px;
    }
    
    .header-content {
        gap: 16px;
    }
    
    .ask-ai-panel {
        padding: 16px;
    }
    
    .ask-ai-form {
        flex-direction: column;
    }
    
    .timeline-container {
        max-width: 100%;
    }
    
    .timeline-post {
        padding: 16px;
    }
    
    .article-title {
        font-size: 24px;
    }
    
    .article-actions {
        flex-wrap: wrap;
    }
    
    .main-content {
        padding: 16px;
    }
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
    println!("  1. {} {}", "cd".yellow(), path.display());
    println!("  2. {} build", "ailog".yellow());
    println!("  3. {} serve", "ailog".yellow());
    println!("\nOr use path as argument:");
    println!("  {} -- build {}", "cargo run".yellow(), path.display());
    println!("  {} -- serve {}", "cargo run".yellow(), path.display());
    println!("\nTo create a new post:");
    println!("  {} -- new \"Post Title\" {}", "cargo run".yellow(), path.display());

    Ok(())
}