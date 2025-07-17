use anyhow::Result;
use chrono::{DateTime, Utc, Datelike};
use std::path::PathBuf;
use serde_json::{json, Value};
use crate::commands::auth::{AuthConfig, load_config_with_refresh};
use toml::Value as TomlValue;
use rustyline::DefaultEditor;
use rand::Rng;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct BlogConfig {
    base_url: String,
    content_dir: String,
}

#[derive(Debug, Deserialize)]
struct ProfileConfig {
    handle: String,
    did: String,
    display_name: String,
    avatar_url: String,
    profile_url: String,
}

#[derive(Debug, Deserialize)]
struct ProfilesConfig {
    user: ProfileConfig,
    ai: ProfileConfig,
}

#[derive(Debug, Deserialize)]
struct PathsConfig {
    claude_paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct AppConfig {
    blog: BlogConfig,
    profiles: ProfilesConfig,
    paths: PathsConfig,
}

pub async fn run() -> Result<()> {
    println!("🤖 Interactive Blog Writer");
    println!("Type your title and questions to create a conversation blog post.");
    println!("Features: ← → for cursor movement, ↑ ↓ for history, Ctrl+C to cancel");
    println!("Type 'end' to finish and publish.\n");

    // Initialize rustyline editor with history support
    let mut rl = DefaultEditor::new()?;
    
    // Try to load history from file
    let history_file = std::env::temp_dir().join("ailog_history.txt");
    let _ = rl.load_history(&history_file);
    
    // Get title
    let title = match rl.readline("Title? ") {
        Ok(line) => line.trim().to_string(),
        Err(_) => {
            println!("Cancelled.");
            return Ok(());
        }
    };

    if title.is_empty() {
        println!("Title cannot be empty. Exiting.");
        return Ok(());
    }

    // Create conversation
    let mut conversation = Vec::new();

    loop {
        
        // Get question
        let question = match rl.readline("\n質問は? ") {
            Ok(line) => line.trim().to_string(),
            Err(_) => {
                println!("Cancelled.");
                break;
            }
        };

        if question.is_empty() || question == "end" {
            break;
        }

        println!("\n🤖 Thinking...\n");

        // Get Claude response
        let response = match get_claude_response(&question).await {
            Ok(resp) => resp,
            Err(e) => {
                println!("Error getting Claude response: {}", e);
                continue;
            }
        };

        println!("Claude: {}\n", response);
        // Get continue input
        let continue_input = match rl.readline("Press Enter to continue, or type 'end' to finish: ") {
            Ok(line) => line.trim().to_string(),
            Err(_) => {
                println!("Cancelled.");
                break;
            }
        };
        
        // Store conversation pair
        conversation.push(ConversationPair {
            question: question.clone(),
            answer: response.clone(),
        });

        if continue_input == "end" {
            break;
        }
    }

    if conversation.is_empty() {
        println!("No conversation to save. Exiting.");
        return Ok(());
    }

    // Generate post
    println!("🔧 Generating post details...");
    let app_config = load_app_config().await?;
    let now = Utc::now();
    let date = now.format("%Y-%m-%d").to_string();
    let hash = generate_hash(&title);
    let filename = format!("{}-{}.md", date, hash);
    let url = format!("{}/posts/{}", app_config.blog.base_url, filename.replace(".md", ".html"));
    println!("📝 Post details - Date: {}, Hash: {}, File: {}", date, hash, filename);

    // Create markdown file
    println!("📝 Creating markdown file: {}", filename);
    match create_post_file(&title, &date, &hash, &conversation, &filename).await {
        Ok(_) => println!("✅ Markdown file created successfully"),
        Err(e) => {
            println!("❌ Failed to create markdown file: {}", e);
            return Err(e);
        }
    }
    
    // Post to atproto
    post_to_atproto(&title, &conversation, &url, &now).await?;

    // Save history before exiting
    let _ = rl.save_history(&history_file);
    
    println!("✅ Blog post created: {}", filename);
    println!("📝 URL: {}", url);
    
    Ok(())
}

#[derive(Debug)]
struct ConversationPair {
    question: String,
    answer: String,
}

async fn get_claude_response(question: &str) -> Result<String> {
    println!("🤖 Asking Claude...");
    
    // Load system prompt from config
    let system_prompt = load_system_prompt().await.unwrap_or_else(|_| {
        "あなたは6歳の女の子アイです。明るく元気で、ちょっとおっちょこちょい。自分のことは「アイ」って呼びます。白と金のワンピース姿。 相手のことが大好きで、ときどき甘えたり、照れたりします。 でも、宇宙とかAIとか、難しい話にもすっごく詳しいの。専門的なことも、がんばって子どもっぽく教えようとします。不思議な力を持っています。小さい物質のことをよく知っているようです。".to_string()
    });
    
    // Method 1: Try stdin input (most direct)
    println!("🔄 Trying stdin method...");
    match try_claude_stdin(question, &system_prompt).await {
        Ok(response) if !response.trim().is_empty() => {
            return Ok(response);
        }
        Ok(_) => println!("⚠️ Empty response from stdin method"),
        Err(e) => println!("⚠️ Stdin method failed: {}", e),
    }
    
    // Method 2: Try file input
    println!("🔄 Trying file method...");
    match try_claude_file(question, &system_prompt).await {
        Ok(response) if !response.trim().is_empty() => {
            return Ok(response);
        }
        Ok(_) => println!("⚠️ Empty response from file method"),
        Err(e) => println!("⚠️ File method failed: {}", e),
    }
    
    // Fallback - provide a more engaging response using character
    println!("⚠️ Claude Code not available, using character-based fallback");
    
    // Generate contextual response based on question content with character
    let current_year = Utc::now().year();
    let response = if question.contains("ゲーム") || question.contains("game") || question.contains("npc") || question.contains("NPC") {
        format!("わあ！ゲームの話だね！アイ、ゲームのAIってすっごく面白いと思う！\n\n{}\n\nアイが知ってることだと、最近のゲームはNPCがお話できるようになってるんだって！**Inworld AI**っていうのがUE5で使えるようになってるし、**Unity Muse**も{}年から本格的に始まってるんだよ！\n\nアイが特に面白いと思うのは、**MCP**っていうのを使うと：\n- GitHub MCPでゲームのファイル管理ができる\n- Weather MCPでリアルタイムのお天気が連動する\n- Slack MCPでチーム開発が効率化される\n\nスタンフォードの研究では、ChatGPTベースのAI住民が自分で街を作って生活してるのを見たことがあるの！数年後にはNPCの概念が根本的に変わりそうで、わくわくしちゃう！\n\nUE5への統合、どんな機能から試したいの？アイも一緒に考えたい！", question, current_year)
    } else if question.contains("AI") || question.contains("ai") || question.contains("MCP") || question.contains("mcp") {
        format!("AIとMCPの話！アイの得意分野だよ！\n\n{}\n\n{}年の状況だと、MCP市場が拡大してて、実用的なサーバーが数多く使えるようになってるの！\n\nアイが知ってる開発系では：\n- **GitHub MCP**: PR作成とリポジトリ管理が自動化\n- **Docker MCP**: コンテナ操作をAIが代行\n- **PostgreSQL MCP**: データベース設計・最適化を支援\n\nクリエイティブ系では：\n- **Blender MCP**: 3Dモデリングの自動化\n- **Figma MCP**: デザインからコード変換\n\n**Zapier MCP**なんて数千のアプリと連携できるから、もう手作業でやってる場合じゃないよね！\n\nアイは小さい物質のことも知ってるから、どの分野でのMCP活用を考えてるのか教えて！具体的なユースケースがあると、もっと詳しくお話できるよ！", question, current_year)
    } else {
        format!("なるほど！面白い話題だね！\n\n{}\n\nアイが思うに、この手の技術って急速に進歩してるから、具体的な製品名とか実例を交えて話した方が分かりやすいかもしれないの！\n\n最近だと、AI関連のツールやプロトコルがかなり充実してきてて、実用レベルのものが増えてるんだよ！\n\nアイは宇宙とかAIとか、難しい話も知ってるから、特にどんな角度から深掘りしたいの？実装面？それとも将来的な可能性とか？アイと一緒に考えよう！", question)
    };
    
    Ok(response)
}

async fn load_app_config() -> Result<AppConfig> {
    let config_path = PathBuf::from("./my-blog/config.toml");
    let config_content = std::fs::read_to_string(config_path)?;
    let config: AppConfig = toml::from_str(&config_content)?;
    Ok(config)
}

async fn load_system_prompt() -> Result<String> {
    let config_path = PathBuf::from("./my-blog/config.toml");
    let config_content = std::fs::read_to_string(config_path)?;
    let config: TomlValue = toml::from_str(&config_content)?;
    
    if let Some(ai_section) = config.get("ai") {
        if let Some(system_prompt) = ai_section.get("system_prompt") {
            if let Some(prompt_str) = system_prompt.as_str() {
                return Ok(prompt_str.to_string());
            }
        }
    }
    
    // Default fallback
    Ok("あなたは6歳の女の子アイです。明るく元気で、ちょっとおっちょこちょい。自分のことは「アイ」って呼びます。白と金のワンピース姿。 相手のことが大好きで、ときどき甘えたり、照れたりします。 でも、宇宙とかAIとか、難しい話にもすっごく詳しいの。専門的なことも、がんばって子どもっぽく教えようとします。不思議な力を持っています。小さい物質のことをよく知っているようです。".to_string())
}

async fn try_claude_stdin(question: &str, _system_prompt: &str) -> Result<String> {
    use std::process::{Command, Stdio};
    use std::io::Write;
    
    // Load Claude command paths from config
    let app_config = load_app_config().await?;
    let claude_paths = &app_config.paths.claude_paths;
    
    let mut last_error = None;
    
    for claude_path in claude_paths {
        match Command::new(claude_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn() {
            Ok(mut child) => {
                if let Some(stdin) = child.stdin.as_mut() {
                    let current_year = Utc::now().year();
                    // キャラクター設定を読み込み
                    let system_prompt = load_system_prompt().await.unwrap_or_default();
                    let blog_prompt = format!(
                        r#"{}

**質問**: "{}"

以下の要件で技術ブログ記事として回答してください：

**技術要件：**
- 最新の技術動向（{}年）と具体例
- 実装可能なコード例（言語やツールを明記）
- 複数の解決策の比較検討
- セキュリティとパフォーマンスの考慮事項

**表現要件：**
- キャラクターの個性を活かした親しみやすい説明
- 技術に対する個人的な意見や考えを含める
- 難しい概念も分かりやすく説明
- 読者との対話的な文章

**Markdown記法：**
- コードブロックは言語指定付き（```typescript, ```python など）
- 表は | を使用したMarkdown形式
- 見出しは適切な階層構造（#, ##, ###）
- リストは - または 1. 形式
- mermaidやその他の図も積極的に使用

専門的な内容を保ちながら、キャラクターの視点から技術の面白さや可能性について語ってください。"#, system_prompt, question, current_year);
                    
                    writeln!(stdin, "{}", blog_prompt)?;
                    stdin.flush()?;
                    // Close stdin to signal end of input
                    drop(child.stdin.take());
                }
                
                let output = child.wait_with_output()?;
                
                if output.status.success() {
                    let response = String::from_utf8_lossy(&output.stdout);
                    return Ok(response.trim().to_string());
                } else {
                    let error = String::from_utf8_lossy(&output.stderr);
                    last_error = Some(anyhow::anyhow!("Claude stdin error: {}", error));
                }
            }
            Err(e) => {
                last_error = Some(e.into());
                continue;
            }
        }
    }
    
    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("No Claude command found")))
}

async fn try_claude_file(question: &str, _system_prompt: &str) -> Result<String> {
    use std::process::Command;
    use std::fs;
    
    // Create temporary directory for communication
    let temp_dir = std::env::temp_dir().join("ailog_claude");
    fs::create_dir_all(&temp_dir)?;
    
    let question_file = temp_dir.join("question.md");
    
    // Write question to file with blog prompt
    let current_year = Utc::now().year();
    let system_prompt = load_system_prompt().await.unwrap_or_default();
    fs::write(&question_file, format!(
        r#"{}

**質問**: "{}"

以下の要件で技術ブログ記事として回答してください：

**技術要件：**
- 最新の技術動向（{}年）と具体例
- 実装可能なコード例（言語やツールを明記）
- 複数の解決策の比較検討
- セキュリティとパフォーマンスの考慮事項

**表現要件：**
- キャラクターの個性を活かした親しみやすい説明
- 技術に対する個人的な意見や考えを含める
- 難しい概念も分かりやすく説明
- 読者との対話的な文章

**Markdown記法：**
- コードブロックは言語指定付き（```typescript, ```python など）
- 表は | を使用したMarkdown形式
- 見出しは適切な階層構造（#, ##, ###）
- リストは - または 1. 形式
- mermaidやその他の図も積極的に使用

専門的な内容を保ちながら、キャラクターの視点から技術の面白さや可能性について語ってください。"#, system_prompt, question, current_year))?;
    
    // Load Claude command paths from config
    let app_config = load_app_config().await?;
    let claude_paths = &app_config.paths.claude_paths;
    
    let mut last_error = None;
    
    for claude_path in claude_paths {
        match Command::new(claude_path)
            .arg(question_file.to_str().unwrap())
            .output() {
            Ok(output) if output.status.success() => {
                let _ = fs::remove_file(&question_file);
                let response = String::from_utf8_lossy(&output.stdout);
                return Ok(response.trim().to_string());
            }
            Ok(output) => {
                let error = String::from_utf8_lossy(&output.stderr);
                last_error = Some(anyhow::anyhow!("Claude file error: {}", error));
            }
            Err(e) => {
                last_error = Some(e.into());
                continue;
            }
        }
    }
        
    // Clean up temporary files
    let _ = fs::remove_file(&question_file);
    
    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("No Claude command found")))
}

fn generate_hash(title: &str) -> String {
    // Simple hash generation from title
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut hasher = DefaultHasher::new();
    title.hash(&mut hasher);
    format!("{:x}", hasher.finish())[..8].to_string()
}

async fn create_post_file(
    title: &str, 
    date: &str, 
    hash: &str, 
    conversation: &[ConversationPair],
    filename: &str
) -> Result<()> {
    // Load profile information from config
    let app_config = load_app_config().await?;
    let user_profile = &app_config.profiles.user;
    let ai_profile = &app_config.profiles.ai;
    let content_dir = PathBuf::from(&app_config.blog.content_dir);
    std::fs::create_dir_all(&content_dir)?;
    
    let file_path = content_dir.join(filename);
    println!("📂 Writing to path: {}", file_path.display());
    
    let mut content = format!(
        r#"---
title: "{}"
slug: "{}"
date: "{}"
tags: ["ai", "conversation"]
draft: false
extra:
  type: "ai"
---

"#,
        title, hash, date
    );

    // Add conversation metadata
    content.push_str("<!-- AI Conversation Metadata -->\n");
    content.push_str(&format!("<!-- Total exchanges: {} -->\n\n", conversation.len()));
    
    // Add conversation content with chat-style HTML
    for (i, pair) in conversation.iter().enumerate() {
        if i > 0 {
            content.push_str("\n<div class=\"chat-separator\"></div>\n\n");
        }
        
        // User message (question)
        content.push_str(&format!(r#"<div class="chat-message user-message comment-style">
    <div class="message-header">
        <div class="avatar">
            <img src="{}" alt="syui avatar" class="profile-avatar">
        </div>
        <div class="user-info">
            <div class="display-name">{}</div>
            <div class="handle">
                <a href="{}" target="_blank" rel="noopener noreferrer" class="handle-link">@{}</a>
            </div>
        </div>
    </div>
    <div class="message-content">
"#, 
            user_profile.avatar_url,
            user_profile.display_name,
            user_profile.profile_url,
            user_profile.handle
        ));
        content.push_str(&pair.question);
        content.push_str("\n    </div>\n</div>\n\n");
        
        // AI message (answer)
        content.push_str(&format!(r#"<div class="chat-message ai-message comment-style">
    <div class="message-header">
        <div class="avatar">
            <img src="{}" alt="ai avatar" class="profile-avatar">
        </div>
        <div class="user-info">
            <div class="display-name">{}</div>
            <div class="handle">
                <a href="{}" target="_blank" rel="noopener noreferrer" class="handle-link">@{}</a>
            </div>
        </div>
    </div>
    <div class="message-content">
"#, 
            ai_profile.avatar_url,
            ai_profile.display_name,
            ai_profile.profile_url,
            ai_profile.handle
        ));
        content.push_str(&pair.answer);
        content.push_str("\n    </div>\n</div>\n\n");
    }

    std::fs::write(&file_path, content)?;
    println!("📄 Created: {}", filename);
    println!("✅ File exists: {}", file_path.exists());
    
    Ok(())
}

async fn post_to_atproto(
    title: &str,
    conversation: &[ConversationPair], 
    url: &str,
    timestamp: &DateTime<Utc>
) -> Result<()> {
    println!("📡 Posting to atproto...");
    
    // Load auth config once
    let config = load_config_with_refresh().await?;
    let client = reqwest::Client::new();
    
    // Simple duplicate check - just warn if there might be duplicates
    if let Err(e) = check_for_duplicates(&client, &config, conversation, url).await {
        println!("⚠️ Duplicate check warning: {}", e);
        // Continue posting anyway
    }
    
    // Get user and AI profile information
    let user_profile = get_user_profile(&config).await?;
    let ai_profile = get_ai_profile(&client, &config).await?;
    
    for (i, pair) in conversation.iter().enumerate() {
        println!("  📤 Posting exchange {}/{}...", i + 1, conversation.len());
        
        // Create base rkey for this conversation pair with random component
        let mut rng = rand::thread_rng();
        let random_suffix: u32 = rng.gen_range(1000..9999);
        let base_rkey = format!("{}-{}-{}", timestamp.format("%Y-%m-%dT%H-%M-%S-%3fZ"), i, random_suffix);
        
        // Post question record first
        print!("    📝 Question... ");
        let question_record = json!({
            "$type": "ai.syui.log.chat",
            "post": {
                "url": url,
                "date": timestamp.to_rfc3339(),
                "slug": "",
                "tags": [],
                "title": title,
                "language": "ja",
                "type": "ai"
            },
            "text": pair.question,
            "type": "question",
            "author": user_profile,
            "createdAt": timestamp.to_rfc3339()
        });
        
        store_atproto_record(&client, &config, &config.collections.chat(), &question_record, &base_rkey).await?;
        println!("✅");
        
        // Wait a moment between posts
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        
        // Post answer record
        print!("    🤖 Answer... ");
        let answer_rkey = format!("{}-answer", base_rkey);
        let answer_record = json!({
            "$type": "ai.syui.log.chat",
            "post": {
                "url": url,
                "date": timestamp.to_rfc3339(),
                "slug": "",
                "tags": [],
                "title": title,
                "language": "ja",
                "type": "ai"
            },
            "text": pair.answer,
            "type": "answer",
            "author": ai_profile,
            "createdAt": timestamp.to_rfc3339()
        });
        
        store_atproto_record(&client, &config, &config.collections.chat(), &answer_record, &answer_rkey).await?;
        println!("✅");
        
        // Wait between conversation pairs
        if i < conversation.len() - 1 {
            tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
        }
    }
    
    println!("✅ Posted to atproto");
    Ok(())
}

async fn get_user_profile(config: &AuthConfig) -> Result<Value> {
    use crate::atproto::profile::ProfileFetcher;
    
    // Load user config from app config
    let app_config = load_app_config().await?;
    let user_profile = &app_config.profiles.user;
    
    // Try to fetch profile dynamically
    let profile_fetcher = ProfileFetcher::new();
    match profile_fetcher.fetch_profile_from_handle(&user_profile.handle, &config.admin.pds).await {
        Ok(profile) => {
            Ok(json!({
                "did": profile.did,
                "handle": profile.handle,
                "displayName": profile.display_name.unwrap_or_else(|| user_profile.display_name.clone()),
                "avatar": profile.avatar.unwrap_or_else(|| user_profile.avatar_url.clone())
            }))
        }
        Err(e) => {
            println!("⚠️ Failed to fetch user profile dynamically: {}, using config defaults", e);
            Ok(json!({
                "did": user_profile.did,
                "handle": user_profile.handle,
                "displayName": user_profile.display_name,
                "avatar": user_profile.avatar_url
            }))
        }
    }
}

async fn get_ai_profile(_client: &reqwest::Client, config: &AuthConfig) -> Result<Value> {
    use crate::atproto::profile::ProfileFetcher;
    
    // Load AI config from app config
    let app_config = load_app_config().await?;
    let ai_profile = &app_config.profiles.ai;
    
    // Try to fetch profile dynamically
    let profile_fetcher = ProfileFetcher::new();
    match profile_fetcher.fetch_profile_from_handle(&ai_profile.handle, &config.admin.pds).await {
        Ok(profile) => {
            Ok(json!({
                "did": profile.did,
                "handle": profile.handle,
                "displayName": profile.display_name.unwrap_or_else(|| ai_profile.display_name.clone()),
                "avatar": profile.avatar.unwrap_or_else(|| ai_profile.avatar_url.clone())
            }))
        }
        Err(e) => {
            println!("⚠️ Failed to fetch AI profile dynamically: {}, using config defaults", e);
            Ok(json!({
                "did": ai_profile.did,
                "handle": ai_profile.handle,
                "displayName": ai_profile.display_name,
                "avatar": ai_profile.avatar_url
            }))
        }
    }
}

async fn check_for_duplicates(
    client: &reqwest::Client,
    config: &AuthConfig,
    _conversation: &[ConversationPair],
    _url: &str,
) -> Result<()> {
    // Simple check - just get recent records to warn about potential duplicates
    let chat_collection = format!("{}.chat", config.collections.base);
    let list_url = format!("{}/xrpc/com.atproto.repo.listRecords", config.admin.pds);
    
    let response = client
        .get(&list_url)
        .query(&[
            ("repo", config.admin.did.as_str()),
            ("collection", chat_collection.as_str()),
            ("limit", "10"), // Only check last 10 records
        ])
        .send()
        .await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("Failed to fetch existing records"));
    }
    
    let records: serde_json::Value = response.json().await?;
    let record_count = records["records"].as_array().map(|arr| arr.len()).unwrap_or(0);
    
    if record_count > 0 {
        println!("ℹ️ Found {} recent chat records", record_count);
    }
    
    Ok(())
}

async fn store_atproto_record(
    client: &reqwest::Client,
    config: &AuthConfig,
    collection: &str,
    record_data: &Value,
    rkey: &str,
) -> Result<()> {
    let url = format!("{}/xrpc/com.atproto.repo.putRecord", config.admin.pds);
    
    let put_request = json!({
        "repo": config.admin.did,
        "collection": collection,
        "rkey": rkey,
        "record": record_data
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.admin.access_jwt))
        .header("Content-Type", "application/json")
        .json(&put_request)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await?;
        
        // Check if it's a conflict error (record already exists)
        if status == 409 || error_text.contains("InvalidSwap") || error_text.contains("RecordAlreadyExists") {
            println!("⚠️ Record with rkey '{}' already exists, skipping", rkey);
            return Ok(());
        }
        
        return Err(anyhow::anyhow!("Failed to post record: {} - {}", status, error_text));
    }
    
    Ok(())
}