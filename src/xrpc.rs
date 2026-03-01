use anyhow::{Context, Result};
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::commands::oauth::{self, OAuthSession};
use crate::error::{AppError, AtprotoErrorResponse};
use crate::lexicons::{self, Endpoint};

/// XRPC client wrapping reqwest with ATProto-specific error handling.
#[derive(Clone)]
pub struct XrpcClient {
    inner: reqwest::Client,
    pds_host: String,
    is_bot: bool,
}

impl XrpcClient {
    /// Create a new XrpcClient targeting the given PDS host (e.g. "syu.is").
    pub fn new(pds_host: &str) -> Self {
        Self {
            inner: reqwest::Client::new(),
            pds_host: pds_host.to_string(),
            is_bot: false,
        }
    }

    /// Create a new XrpcClient for bot usage
    pub fn new_bot(pds_host: &str) -> Self {
        Self {
            inner: reqwest::Client::new(),
            pds_host: pds_host.to_string(),
            is_bot: true,
        }
    }

    /// Build XRPC URL for an endpoint
    fn url(&self, endpoint: &Endpoint) -> String {
        lexicons::url(&self.pds_host, endpoint)
    }

    /// Ensure URL has scheme
    fn ensure_scheme(url: &str) -> String {
        if url.starts_with("https://") || url.starts_with("http://") {
            url.to_string()
        } else {
            format!("https://{}", url)
        }
    }

    /// Try to load OAuth session
    fn try_load_oauth(&self) -> Option<OAuthSession> {
        if oauth::has_oauth_session(self.is_bot) {
            oauth::load_oauth_session(self.is_bot).ok()
        } else {
            None
        }
    }

    /// Authenticated GET query (with DPoP nonce retry)
    pub async fn query_auth<T: DeserializeOwned>(
        &self,
        endpoint: &Endpoint,
        params: &[(&str, &str)],
        token: &str,
    ) -> Result<T> {
        let mut url = self.url(endpoint);
        if !params.is_empty() {
            url.push('?');
            let qs: Vec<String> = params
                .iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect();
            url.push_str(&qs.join("&"));
        }

        let full_url = Self::ensure_scheme(&url);

        if let Some(oauth) = self.try_load_oauth() {
            self.dpop_request_with_retry(&oauth, token, "GET", &url, &full_url, None::<&()>)
                .await
        } else {
            let res = self
                .inner
                .get(&url)
                .header("Authorization", format!("Bearer {}", token))
                .send()
                .await
                .context("XRPC authenticated query failed")?;
            self.handle_response(res).await
        }
    }

    /// Authenticated POST call (procedure, with DPoP nonce retry)
    pub async fn call<B: Serialize, T: DeserializeOwned>(
        &self,
        endpoint: &Endpoint,
        body: &B,
        token: &str,
    ) -> Result<T> {
        let url = self.url(endpoint);
        let full_url = Self::ensure_scheme(&url);

        if let Some(oauth) = self.try_load_oauth() {
            self.dpop_request_with_retry(&oauth, token, "POST", &url, &full_url, Some(body))
                .await
        } else {
            let res = self
                .inner
                .post(&url)
                .header("Authorization", format!("Bearer {}", token))
                .json(body)
                .send()
                .await
                .context("XRPC call failed")?;
            self.handle_response(res).await
        }
    }

    /// Unauthenticated POST call (e.g. createSession)
    pub async fn call_unauth<B: Serialize, T: DeserializeOwned>(
        &self,
        endpoint: &Endpoint,
        body: &B,
    ) -> Result<T> {
        let url = self.url(endpoint);

        let res = self
            .inner
            .post(&url)
            .json(body)
            .send()
            .await
            .context("XRPC unauthenticated call failed")?;

        self.handle_response(res).await
    }

    /// Authenticated POST that returns no body (with DPoP nonce retry)
    pub async fn call_no_response<B: Serialize>(
        &self,
        endpoint: &Endpoint,
        body: &B,
        token: &str,
    ) -> Result<()> {
        let url = self.url(endpoint);
        let full_url = Self::ensure_scheme(&url);

        if let Some(oauth) = self.try_load_oauth() {
            self.dpop_no_response_with_retry(&oauth, token, "POST", &url, &full_url, body)
                .await
        } else {
            let res = self
                .inner
                .post(&url)
                .header("Authorization", format!("Bearer {}", token))
                .json(body)
                .send()
                .await
                .context("XRPC call failed")?;

            if !res.status().is_success() {
                return Err(self.parse_error(res).await);
            }
            Ok(())
        }
    }

    /// Authenticated POST with only a bearer token (no JSON body, e.g. refreshSession)
    /// This is always Bearer (legacy refresh), not DPoP.
    pub async fn call_bearer<T: DeserializeOwned>(
        &self,
        endpoint: &Endpoint,
        token: &str,
    ) -> Result<T> {
        let url = self.url(endpoint);

        let res = self
            .inner
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("XRPC bearer call failed")?;

        self.handle_response(res).await
    }

    /// DPoP-authenticated request with nonce retry (returns deserialized body)
    async fn dpop_request_with_retry<B: Serialize, T: DeserializeOwned>(
        &self,
        oauth: &OAuthSession,
        token: &str,
        method: &str,
        url: &str,
        full_url: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let mut dpop_nonce: Option<String> = None;

        for _attempt in 0..2 {
            let dpop_proof = oauth::create_dpop_proof_for_request_with_nonce(
                oauth,
                method,
                full_url,
                dpop_nonce.as_deref(),
            )?;

            let builder = match method {
                "GET" => self.inner.get(url),
                _ => {
                    let b = self.inner.post(url);
                    if let Some(body) = body {
                        b.json(body)
                    } else {
                        b
                    }
                }
            };

            let res = builder
                .header("Authorization", format!("DPoP {}", token))
                .header("DPoP", dpop_proof)
                .send()
                .await
                .context("XRPC DPoP request failed")?;

            // Check for dpop-nonce requirement
            if res.status() == 401 {
                if let Some(nonce) = res
                    .headers()
                    .get("dpop-nonce")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string())
                {
                    let body_text = res.text().await.unwrap_or_default();
                    if body_text.contains("use_dpop_nonce") {
                        dpop_nonce = Some(nonce);
                        continue;
                    }
                    return Err(anyhow::anyhow!("XRPC error (401): {}", body_text));
                }
            }

            return self.handle_response(res).await;
        }

        anyhow::bail!("XRPC DPoP request failed after nonce retry");
    }

    /// DPoP-authenticated request with nonce retry (no response body)
    async fn dpop_no_response_with_retry<B: Serialize>(
        &self,
        oauth: &OAuthSession,
        token: &str,
        method: &str,
        url: &str,
        full_url: &str,
        body: &B,
    ) -> Result<()> {
        let mut dpop_nonce: Option<String> = None;

        for _attempt in 0..2 {
            let dpop_proof = oauth::create_dpop_proof_for_request_with_nonce(
                oauth,
                method,
                full_url,
                dpop_nonce.as_deref(),
            )?;

            let res = self
                .inner
                .post(url)
                .json(body)
                .header("Authorization", format!("DPoP {}", token))
                .header("DPoP", dpop_proof)
                .send()
                .await
                .context("XRPC DPoP call failed")?;

            if res.status() == 401 {
                if let Some(nonce) = res
                    .headers()
                    .get("dpop-nonce")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string())
                {
                    let body_text = res.text().await.unwrap_or_default();
                    if body_text.contains("use_dpop_nonce") {
                        dpop_nonce = Some(nonce);
                        continue;
                    }
                    return Err(anyhow::anyhow!("XRPC error (401): {}", body_text));
                }
            }

            if !res.status().is_success() {
                return Err(self.parse_error(res).await);
            }
            return Ok(());
        }

        anyhow::bail!("XRPC DPoP call failed after nonce retry");
    }

    /// Handle an XRPC response: check status, parse ATProto errors, deserialize body.
    async fn handle_response<T: DeserializeOwned>(&self, res: reqwest::Response) -> Result<T> {
        if !res.status().is_success() {
            return Err(self.parse_error(res).await);
        }

        let body = res
            .json::<T>()
            .await
            .context("Failed to parse XRPC response body")?;
        Ok(body)
    }

    /// Parse an error response into an AppError
    async fn parse_error(&self, res: reqwest::Response) -> anyhow::Error {
        let status = res.status().as_u16();

        // Check for rate limiting
        if status == 429 {
            let retry_after = res
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(5);
            return AppError::RateLimited {
                retry_after_secs: retry_after,
            }
            .into();
        }

        // Try to parse ATProto error body
        let body_text = res.text().await.unwrap_or_default();
        let message = if let Ok(at_err) = serde_json::from_str::<AtprotoErrorResponse>(&body_text)
        {
            // Check for expired token
            if at_err.error.as_deref() == Some("ExpiredToken") {
                return AppError::SessionExpired(
                    at_err.message.unwrap_or_else(|| "Token expired".to_string()),
                )
                .into();
            }
            at_err.to_display_string()
        } else {
            body_text
        };

        AppError::xrpc(status, message).into()
    }
}
