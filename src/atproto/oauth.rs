use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::config::AtprotoConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientMetadata {
    pub client_id: String,
    pub client_name: String,
    pub client_uri: String,
    pub logo_uri: String,
    pub tos_uri: String,
    pub policy_uri: String,
    pub redirect_uris: Vec<String>,
    pub scope: String,
    pub grant_types: Vec<String>,
    pub response_types: Vec<String>,
    pub token_endpoint_auth_method: String,
    pub application_type: String,
    pub dpop_bound_access_tokens: bool,
}

#[derive(Debug, Clone)]
pub struct OAuthHandler {
    config: AtprotoConfig,
    client: reqwest::Client,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthorizationRequest {
    pub response_type: String,
    pub client_id: String,
    pub redirect_uri: String,
    pub state: String,
    pub scope: String,
    pub code_challenge: String,
    pub code_challenge_method: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: u64,
    pub refresh_token: Option<String>,
    pub scope: String,
}

impl OAuthHandler {
    pub fn new(config: AtprotoConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }

    pub fn generate_client_metadata(&self) -> ClientMetadata {
        ClientMetadata {
            client_id: self.config.client_id.clone(),
            client_name: "ailog - AI-powered blog".to_string(),
            client_uri: "https://example.com".to_string(),
            logo_uri: "https://example.com/logo.png".to_string(),
            tos_uri: "https://example.com/tos".to_string(),
            policy_uri: "https://example.com/policy".to_string(),
            redirect_uris: vec![self.config.redirect_uri.clone()],
            scope: "atproto".to_string(),
            grant_types: vec!["authorization_code".to_string(), "refresh_token".to_string()],
            response_types: vec!["code".to_string()],
            token_endpoint_auth_method: "none".to_string(),
            application_type: "web".to_string(),
            dpop_bound_access_tokens: true,
        }
    }

    pub fn generate_authorization_url(&self, state: &str, code_challenge: &str) -> String {
        let params = vec![
            ("response_type", "code"),
            ("client_id", &self.config.client_id),
            ("redirect_uri", &self.config.redirect_uri),
            ("state", state),
            ("scope", "atproto"),
            ("code_challenge", code_challenge),
            ("code_challenge_method", "S256"),
        ];

        let query = params.into_iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");

        format!("{}/oauth/authorize?{}", self.config.handle_resolver, query)
    }

    pub async fn exchange_code(&self, code: &str, code_verifier: &str) -> Result<TokenResponse> {
        let params = HashMap::from([
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", &self.config.redirect_uri),
            ("client_id", &self.config.client_id),
            ("code_verifier", code_verifier),
        ]);

        let response = self.client
            .post(format!("{}/oauth/token", self.config.handle_resolver))
            .form(&params)
            .send()
            .await?;

        if response.status().is_success() {
            let token: TokenResponse = response.json().await?;
            Ok(token)
        } else {
            anyhow::bail!("Failed to exchange authorization code")
        }
    }

    pub async fn refresh_token(&self, refresh_token: &str) -> Result<TokenResponse> {
        let params = HashMap::from([
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", &self.config.client_id),
        ]);

        let response = self.client
            .post(format!("{}/oauth/token", self.config.handle_resolver))
            .form(&params)
            .send()
            .await?;

        if response.status().is_success() {
            let token: TokenResponse = response.json().await?;
            Ok(token)
        } else {
            anyhow::bail!("Failed to refresh token")
        }
    }
}

// PKCE helpers
pub fn generate_code_verifier() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::thread_rng();
    
    (0..128)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

pub fn generate_code_challenge(verifier: &str) -> String {
    use sha2::{Sha256, Digest};
    use base64::{Engine as _, engine::general_purpose};
    
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let result = hasher.finalize();
    
    general_purpose::URL_SAFE_NO_PAD.encode(result)
}