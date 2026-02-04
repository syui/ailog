use anyhow::Result;
use serde_json::Value;

use super::auth;
use crate::lexicons::app_bsky_notification;
use crate::xrpc::XrpcClient;

/// List notifications (JSON output)
pub async fn list(limit: u32) -> Result<()> {
    let session = auth::refresh_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let client = XrpcClient::new(pds);
    let limit_str = limit.to_string();

    let body: Value = client
        .query_auth(
            &app_bsky_notification::LIST_NOTIFICATIONS,
            &[("limit", &limit_str)],
            &session.access_jwt,
        )
        .await?;

    println!("{}", serde_json::to_string_pretty(&body)?);
    Ok(())
}

/// Get unread notification count (JSON output)
pub async fn count() -> Result<()> {
    let session = auth::refresh_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let client = XrpcClient::new(pds);

    let body: Value = client
        .query_auth(
            &app_bsky_notification::GET_UNREAD_COUNT,
            &[],
            &session.access_jwt,
        )
        .await?;

    println!("{}", serde_json::to_string_pretty(&body)?);
    Ok(())
}

/// Mark notifications as seen (up to now)
pub async fn update_seen() -> Result<()> {
    let session = auth::refresh_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let client = XrpcClient::new(pds);
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();

    let body = serde_json::json!({ "seenAt": now });

    client
        .call_no_response(
            &app_bsky_notification::UPDATE_SEEN,
            &body,
            &session.access_jwt,
        )
        .await?;

    let result = serde_json::json!({ "success": true, "seenAt": now });
    println!("{}", serde_json::to_string_pretty(&result)?);
    Ok(())
}
