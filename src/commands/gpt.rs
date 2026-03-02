use anyhow::{Context, Result};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

use super::auth;
use crate::lexicons::com_atproto_repo;
use crate::types::{ListRecordsResponse, PutRecordRequest, PutRecordResponse, Record};
use crate::xrpc::XrpcClient;

const COLLECTION_CORE: &str = "ai.syui.gpt.core";
const COLLECTION_MEMORY: &str = "ai.syui.gpt.memory";
/// Get base dir: $cfg/ai.syui.log/content/
fn gpt_base_dir() -> Result<PathBuf> {
    Ok(dirs::config_dir()
        .context("Could not find config directory")?
        .join(super::token::BUNDLE_ID)
        .join("at"))
}

/// Get core record (rkey=self)
pub async fn get_core(download: bool) -> Result<()> {
    let session = auth::refresh_bot_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let client = XrpcClient::new_bot(pds);

    let record: Record = client
        .query_auth(
            &com_atproto_repo::GET_RECORD,
            &[
                ("repo", &session.did),
                ("collection", COLLECTION_CORE),
                ("rkey", "self"),
            ],
            &session.access_jwt,
        )
        .await?;

    println!("{}", serde_json::to_string_pretty(&record.value)?);

    if download {
        save_record(&session.did, COLLECTION_CORE, "self", &record)?;
    }

    Ok(())
}

/// Get latest memory record
pub async fn get_memory(download: bool) -> Result<()> {
    let session = auth::refresh_bot_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let client = XrpcClient::new_bot(pds);

    if download {
        // Download all memory records
        let mut cursor: Option<String> = None;
        let mut count = 0;

        loop {
            let mut params: Vec<(&str, &str)> = vec![
                ("repo", &session.did),
                ("collection", COLLECTION_MEMORY),
                ("limit", "100"),
            ];
            let cursor_val;
            if let Some(ref c) = cursor {
                cursor_val = c.clone();
                params.push(("cursor", &cursor_val));
            }

            let result: ListRecordsResponse = client
                .query_auth(
                    &com_atproto_repo::LIST_RECORDS,
                    &params,
                    &session.access_jwt,
                )
                .await?;

            let batch = result.records.len();
            for record in &result.records {
                let rkey = record.uri.split('/').next_back().unwrap_or("unknown");
                save_record(&session.did, COLLECTION_MEMORY, rkey, record)?;
                count += 1;
            }

            match result.cursor {
                Some(c) if batch > 0 => cursor = Some(c),
                _ => break,
            }
        }

        println!("Downloaded {} memory records", count);
    } else {
        // Show latest only
        let result: ListRecordsResponse = client
            .query_auth(
                &com_atproto_repo::LIST_RECORDS,
                &[
                    ("repo", &session.did),
                    ("collection", COLLECTION_MEMORY),
                    ("limit", "1"),
                    ("reverse", "true"),
                ],
                &session.access_jwt,
            )
            .await?;

        let record = result.records.first().context("No memory records found")?;
        println!("{}", serde_json::to_string_pretty(&record.value)?);
    }

    Ok(())
}

/// List all memory records
pub async fn list_memory() -> Result<()> {
    let session = auth::refresh_bot_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let client = XrpcClient::new_bot(pds);

    let mut cursor: Option<String> = None;
    let mut all_records: Vec<Record> = Vec::new();

    loop {
        let mut params: Vec<(&str, &str)> = vec![
            ("repo", &session.did),
            ("collection", COLLECTION_MEMORY),
            ("limit", "100"),
        ];
        let cursor_val;
        if let Some(ref c) = cursor {
            cursor_val = c.clone();
            params.push(("cursor", &cursor_val));
        }

        let result: ListRecordsResponse = client
            .query_auth(
                &com_atproto_repo::LIST_RECORDS,
                &params,
                &session.access_jwt,
            )
            .await?;

        let count = result.records.len();
        all_records.extend(result.records);

        match result.cursor {
            Some(c) if count > 0 => cursor = Some(c),
            _ => break,
        }
    }

    println!("Found {} memory records", all_records.len());
    println!("{:<50} {:>8} {}", "URI", "VERSION", "CREATED");
    println!("{}", "-".repeat(80));

    for record in &all_records {
        let version = record.value["version"]
            .as_i64()
            .map(|v| v.to_string())
            .unwrap_or_else(|| "-".to_string());
        let created = record.value["createdAt"]
            .as_str()
            .unwrap_or("-");
        println!("{:<50} {:>8} {}", record.uri, version, created);
    }

    Ok(())
}

/// Push core or memory records to PDS using bot account
pub async fn push(collection_name: &str) -> Result<()> {
    let collection = match collection_name {
        "core" => COLLECTION_CORE,
        "memory" => COLLECTION_MEMORY,
        _ => anyhow::bail!("Unknown collection: {}. Use 'core' or 'memory'.", collection_name),
    };

    let session = auth::refresh_bot_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let did = &session.did;
    let client = XrpcClient::new_bot(pds);

    let collection_dir = gpt_base_dir()?.join(did).join(collection);
    if !collection_dir.exists() {
        anyhow::bail!("Collection directory not found: {}", collection_dir.display());
    }

    println!("Pushing {} records from {}", collection_name, collection_dir.display());

    let mut count = 0;
    for entry in fs::read_dir(&collection_dir)? {
        let entry = entry?;
        let path = entry.path();

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

/// Save a record to $cfg/ai.syui.gpt/{did}/{collection}/{rkey}.json
fn save_record(did: &str, collection: &str, rkey: &str, record: &Record) -> Result<()> {
    let dir = gpt_base_dir()?.join(did).join(collection);
    fs::create_dir_all(&dir)?;

    let path = dir.join(format!("{}.json", rkey));
    let json = serde_json::json!({
        "uri": record.uri,
        "cid": record.cid,
        "value": record.value,
    });
    fs::write(&path, serde_json::to_string_pretty(&json)?)?;
    println!("Saved: {}", path.display());

    Ok(())
}
