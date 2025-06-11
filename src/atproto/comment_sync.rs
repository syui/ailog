use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use crate::atproto::client::AtprotoClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id: String,
    pub author: String,
    pub author_did: String,
    pub content: String,
    pub timestamp: String,
    pub post_slug: String,
    pub atproto_uri: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentStorage {
    pub comments: Vec<Comment>,
}

#[allow(dead_code)]
pub struct CommentSync {
    client: AtprotoClient,
    storage_path: PathBuf,
}

#[allow(dead_code)]
impl CommentSync {
    pub fn new(client: AtprotoClient, base_path: PathBuf) -> Self {
        let storage_path = base_path.join("data/comments.json");
        Self {
            client,
            storage_path,
        }
    }

    pub async fn load_comments(&self) -> Result<CommentStorage> {
        if self.storage_path.exists() {
            let content = fs::read_to_string(&self.storage_path)?;
            let storage: CommentStorage = serde_json::from_str(&content)?;
            Ok(storage)
        } else {
            Ok(CommentStorage { comments: vec![] })
        }
    }

    pub async fn save_comments(&self, storage: &CommentStorage) -> Result<()> {
        if let Some(parent) = self.storage_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(storage)?;
        fs::write(&self.storage_path, content)?;
        Ok(())
    }

    pub async fn add_comment(&mut self, post_slug: &str, author_did: &str, content: &str) -> Result<Comment> {
        // Get author profile
        let profile = self.client.get_profile(author_did).await?;
        let author_handle = profile["handle"].as_str().unwrap_or("unknown").to_string();
        
        // Create comment in atproto
        let post_uri = format!("ailog://post/{}", post_slug);
        let result = self.client.create_comment(author_did, &post_uri, content).await?;
        
        // Create local comment record
        let comment = Comment {
            id: uuid::Uuid::new_v4().to_string(),
            author: author_handle,
            author_did: author_did.to_string(),
            content: content.to_string(),
            timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            post_slug: post_slug.to_string(),
            atproto_uri: Some(result.uri),
        };
        
        // Save to local storage
        let mut storage = self.load_comments().await?;
        storage.comments.push(comment.clone());
        self.save_comments(&storage).await?;
        
        Ok(comment)
    }

    pub async fn get_comments_for_post(&self, post_slug: &str) -> Result<Vec<Comment>> {
        let storage = self.load_comments().await?;
        Ok(storage.comments
            .into_iter()
            .filter(|c| c.post_slug == post_slug)
            .collect())
    }
}

// Helper to generate comment HTML
#[allow(dead_code)]
pub fn render_comments_html(comments: &[Comment]) -> String {
    let mut html = String::from("<div class=\"comments\">\n");
    html.push_str("  <h3>コメント</h3>\n");
    
    if comments.is_empty() {
        html.push_str("  <p>まだコメントはありません。</p>\n");
    } else {
        for comment in comments {
            html.push_str(&format!(
                r#"  <div class="comment">
    <div class="comment-header">
      <span class="author">@{}</span>
      <span class="timestamp">{}</span>
    </div>
    <div class="comment-content">{}</div>
  </div>
"#,
                comment.author,
                comment.timestamp,
                comment.content
            ));
        }
    }
    
    html.push_str("</div>");
    html
}