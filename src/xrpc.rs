use anyhow::{Context, Result};
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{AppError, AtprotoErrorResponse};
use crate::lexicons::{self, Endpoint};

/// XRPC client wrapping reqwest with ATProto-specific error handling.
#[derive(Clone)]
pub struct XrpcClient {
    inner: reqwest::Client,
    pds_host: String,
}

impl XrpcClient {
    /// Create a new XrpcClient targeting the given PDS host (e.g. "syu.is").
    pub fn new(pds_host: &str) -> Self {
        Self {
            inner: reqwest::Client::new(),
            pds_host: pds_host.to_string(),
        }
    }

    /// Build XRPC URL for an endpoint
    fn url(&self, endpoint: &Endpoint) -> String {
        lexicons::url(&self.pds_host, endpoint)
    }

    /// Authenticated GET query
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

        let res = self
            .inner
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("XRPC authenticated query failed")?;

        self.handle_response(res).await
    }

    /// Authenticated POST call (procedure)
    pub async fn call<B: Serialize, T: DeserializeOwned>(
        &self,
        endpoint: &Endpoint,
        body: &B,
        token: &str,
    ) -> Result<T> {
        let url = self.url(endpoint);

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

    /// Authenticated POST that returns no body (or we ignore the response body)
    pub async fn call_no_response<B: Serialize>(
        &self,
        endpoint: &Endpoint,
        body: &B,
        token: &str,
    ) -> Result<()> {
        let url = self.url(endpoint);

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

    /// Authenticated POST with only a bearer token (no JSON body, e.g. refreshSession)
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

    /// Handle an XRPC response: check status, parse ATProto errors, deserialize body.
    async fn handle_response<T: DeserializeOwned>(&self, res: reqwest::Response) -> Result<T> {
        if !res.status().is_success() {
            return Err(self.parse_error(res).await);
        }

        let body = res.json::<T>().await.context("Failed to parse XRPC response body")?;
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
