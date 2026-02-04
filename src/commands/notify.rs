use anyhow::Result;
use serde_json::Value;
use std::io::Write;

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

/// Poll notifications and output new mentions as NDJSON.
/// Runs until interrupted (Ctrl+C).
pub async fn listen(interval_secs: u64, reasons: &[String]) -> Result<()> {
    let mut last_seen: Option<String> = None;
    let mut stdout = std::io::stdout();

    loop {
        let session = auth::refresh_session().await?;
        let pds = session.pds.as_deref().unwrap_or("bsky.social");
        let client = XrpcClient::new(pds);

        let body: Value = client
            .query_auth(
                &app_bsky_notification::LIST_NOTIFICATIONS,
                &[("limit", "50")],
                &session.access_jwt,
            )
            .await?;

        if let Some(notifications) = body["notifications"].as_array() {
            let mut new_items: Vec<&Value> = Vec::new();

            for notif in notifications {
                // Stop at already-seen notifications
                if let Some(ref seen) = last_seen {
                    if notif["indexedAt"].as_str() == Some(seen.as_str()) {
                        break;
                    }
                }

                // Skip read notifications on first run
                if last_seen.is_none() && notif["isRead"].as_bool() == Some(true) {
                    continue;
                }

                // Filter by reason
                let reason = notif["reason"].as_str().unwrap_or("");
                if !reasons.is_empty() && !reasons.iter().any(|r| r == reason) {
                    continue;
                }

                new_items.push(notif);
            }

            // Output in chronological order (oldest first)
            for notif in new_items.iter().rev() {
                let out = serde_json::json!({
                    "reason": notif["reason"],
                    "uri": notif["uri"],
                    "author": {
                        "did": notif["author"]["did"],
                        "handle": notif["author"]["handle"],
                    },
                    "text": notif["record"]["text"],
                    "indexedAt": notif["indexedAt"],
                });
                writeln!(stdout, "{}", serde_json::to_string(&out)?)?;
                stdout.flush()?;
            }

            // Update last_seen to newest notification
            if let Some(newest) = notifications.first() {
                if let Some(ts) = newest["indexedAt"].as_str() {
                    last_seen = Some(ts.to_string());
                }
            }

            // Mark as seen
            if !new_items.is_empty() {
                let now = chrono::Utc::now()
                    .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                    .to_string();
                let seen_body = serde_json::json!({ "seenAt": now });
                let _ = client
                    .call_no_response(
                        &app_bsky_notification::UPDATE_SEEN,
                        &seen_body,
                        &session.access_jwt,
                    )
                    .await;
            }
        }

        tokio::time::sleep(std::time::Duration::from_secs(interval_secs)).await;
    }
}
