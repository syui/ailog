use anyhow::Result;
use serde_json::Value;
use std::fs;

use super::auth;
use crate::lexicons::com_atproto_repo;
use crate::types::{PutRecordRequest, PutRecordResponse};
use crate::xrpc::XrpcClient;

/// Push local content to PDS
pub async fn push_to_remote(input: &str, collection: &str, is_bot: bool) -> Result<()> {
    let session = if is_bot {
        auth::refresh_bot_session().await?
    } else {
        auth::refresh_session().await?
    };
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let did = &session.did;
    let client = XrpcClient::new(pds);

    // Build collection directory path
    let collection_dir = format!("{}/{}/{}", input, did, collection);

    if !std::path::Path::new(&collection_dir).exists() {
        anyhow::bail!("Collection directory not found: {}", collection_dir);
    }

    println!("Pushing records from {} to {}", collection_dir, collection);

    let mut count = 0;
    for entry in fs::read_dir(&collection_dir)? {
        let entry = entry?;
        let path = entry.path();

        // Skip non-JSON files and index.json
        if path.extension().map(|e| e != "json").unwrap_or(true) {
            continue;
        }
        let filename = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if filename == "index" {
            continue;
        }

        let rkey = filename.to_string();
        let content = fs::read_to_string(&path)?;
        let record_data: Value = serde_json::from_str(&content)?;

        // Extract value from record (sync saves as {uri, cid, value})
        let record = if record_data.get("value").is_some() {
            record_data["value"].clone()
        } else {
            record_data
        };

        let req = PutRecordRequest {
            repo: did.clone(),
            collection: collection.to_string(),
            rkey: rkey.clone(),
            record,
        };

        println!("Pushing: {}", rkey);

        match client
            .call::<_, PutRecordResponse>(
                &com_atproto_repo::PUT_RECORD,
                &req,
                &session.access_jwt,
            )
            .await
        {
            Ok(result) => {
                println!("  OK: {}", result.uri);
                count += 1;
            }
            Err(e) => {
                println!("  Failed: {}", e);
            }
        }
    }

    println!("Pushed {} records to {}", count, collection);

    Ok(())
}
