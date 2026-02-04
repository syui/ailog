use anyhow::{Context, Result};
use serde_json::Value;

use super::auth;
use crate::lexicons::com_atproto_repo;
use crate::tid;
use crate::types::{PutRecordRequest, PutRecordResponse};
use crate::xrpc::XrpcClient;

/// Reply to a post on ATProto.
///
/// `root_uri`, `root_cid`: thread root
/// `parent_uri`, `parent_cid`: direct parent being replied to
pub async fn reply(
    text: &str,
    root_uri: &str,
    root_cid: &str,
    parent_uri: &str,
    parent_cid: &str,
) -> Result<()> {
    let session = auth::refresh_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let client = XrpcClient::new(pds);

    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();

    let record = serde_json::json!({
        "$type": "app.bsky.feed.post",
        "text": text,
        "reply": {
            "root": {
                "uri": root_uri,
                "cid": root_cid,
            },
            "parent": {
                "uri": parent_uri,
                "cid": parent_cid,
            },
        },
        "createdAt": now,
    });

    let rkey = tid::generate_tid();

    let req = PutRecordRequest {
        repo: session.did.clone(),
        collection: "app.bsky.feed.post".to_string(),
        rkey,
        record,
    };

    let result: PutRecordResponse = client
        .call(&com_atproto_repo::PUT_RECORD, &req, &session.access_jwt)
        .await?;

    let out = serde_json::json!({
        "uri": result.uri,
        "cid": result.cid,
    });
    println!("{}", serde_json::to_string_pretty(&out)?);

    Ok(())
}

/// Reply from JSON input (stdin or argument).
/// Expects fields: text, root.uri, root.cid, parent.uri, parent.cid
pub async fn reply_json(json_str: &str, text: &str) -> Result<()> {
    let v: Value = serde_json::from_str(json_str).context("Invalid JSON input")?;

    let root_uri = v["root"]["uri"]
        .as_str()
        .context("missing root.uri")?;
    let root_cid = v["root"]["cid"]
        .as_str()
        .context("missing root.cid")?;
    let parent_uri = v["parent"]["uri"]
        .as_str()
        .context("missing parent.uri")?;
    let parent_cid = v["parent"]["cid"]
        .as_str()
        .context("missing parent.cid")?;

    reply(text, root_uri, root_cid, parent_uri, parent_cid).await
}
