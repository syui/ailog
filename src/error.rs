use thiserror::Error;

/// Structured error types for ailog
#[derive(Debug, Error)]
pub enum AppError {
    #[error("Session expired: {0}")]
    SessionExpired(String),

    #[error("XRPC error ({status}): {message}")]
    Xrpc {
        status: u16,
        message: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Rate limited: retry after {retry_after_secs}s")]
    RateLimited { retry_after_secs: u64 },

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

impl AppError {
    pub fn xrpc(status: u16, message: impl Into<String>) -> Self {
        Self::Xrpc {
            status,
            message: message.into(),
            source: None,
        }
    }
}

/// ATProto error response body
#[derive(Debug, serde::Deserialize)]
pub struct AtprotoErrorResponse {
    pub error: Option<String>,
    pub message: Option<String>,
}

impl AtprotoErrorResponse {
    /// Format as a human-readable string
    pub fn to_display_string(&self) -> String {
        match (&self.error, &self.message) {
            (Some(e), Some(m)) => format!("{}: {}", e, m),
            (Some(e), None) => e.clone(),
            (None, Some(m)) => m.clone(),
            (None, None) => "Unknown error".to_string(),
        }
    }
}
