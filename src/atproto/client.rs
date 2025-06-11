use anyhow::Result;
use serde::{Deserialize, Serialize};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AtprotoClient {
    client: reqwest::Client,
    handle_resolver: String,
    access_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRecordRequest {
    pub repo: String,
    pub collection: String,
    pub record: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRecordResponse {
    pub uri: String,
    pub cid: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommentRecord {
    #[serde(rename = "$type")]
    pub record_type: String,
    pub text: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "postUri")]
    pub post_uri: String,
    pub author: AuthorInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthorInfo {
    pub did: String,
    pub handle: String,
}

#[allow(dead_code)]
impl AtprotoClient {
    pub fn new(handle_resolver: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            handle_resolver,
            access_token: None,
        }
    }

    pub fn set_access_token(&mut self, token: String) {
        self.access_token = Some(token);
    }

    pub async fn create_comment(&self, did: &str, post_uri: &str, text: &str) -> Result<CreateRecordResponse> {
        if self.access_token.is_none() {
            anyhow::bail!("Not authenticated");
        }

        let record = CommentRecord {
            record_type: "app.bsky.feed.post".to_string(),
            text: text.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            post_uri: post_uri.to_string(),
            author: AuthorInfo {
                did: did.to_string(),
                handle: "".to_string(), // Will be resolved by the server
            },
        };

        let request = CreateRecordRequest {
            repo: did.to_string(),
            collection: "app.bsky.feed.post".to_string(),
            record: serde_json::to_value(record)?,
        };

        let response = self.client
            .post(format!("{}/xrpc/com.atproto.repo.createRecord", self.handle_resolver))
            .header(AUTHORIZATION, format!("Bearer {}", self.access_token.as_ref().unwrap()))
            .header(CONTENT_TYPE, "application/json")
            .json(&request)
            .send()
            .await?;

        if response.status().is_success() {
            let result: CreateRecordResponse = response.json().await?;
            Ok(result)
        } else {
            let error_text = response.text().await?;
            anyhow::bail!("Failed to create comment: {}", error_text)
        }
    }

    pub async fn get_profile(&self, did: &str) -> Result<serde_json::Value> {
        let response = self.client
            .get(format!("{}/xrpc/app.bsky.actor.getProfile", self.handle_resolver))
            .query(&[("actor", did)])
            .header(AUTHORIZATION, format!("Bearer {}", self.access_token.as_ref().unwrap_or(&String::new())))
            .send()
            .await?;

        if response.status().is_success() {
            let profile = response.json().await?;
            Ok(profile)
        } else {
            anyhow::bail!("Failed to get profile")
        }
    }
}