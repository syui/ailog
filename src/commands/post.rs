use anyhow::{Context, Result};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;

use super::{auth, token};
use crate::lexicons::{self, com_atproto_repo, com_atproto_identity};

#[derive(Debug, Serialize)]
struct PutRecordRequest {
    repo: String,
    collection: String,
    rkey: String,
    record: Value,
}

#[derive(Debug, Serialize)]
struct DeleteRecordRequest {
    repo: String,
    collection: String,
    rkey: String,
}

#[derive(Debug, Deserialize)]
struct PutRecordResponse {
    uri: String,
    cid: String,
}

#[derive(Debug, Deserialize)]
struct ListRecordsResponse {
    records: Vec<Record>,
    #[serde(default)]
    #[allow(dead_code)]
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Record {
    uri: String,
    cid: String,
    value: Value,
}

/// Generate TID (timestamp-based ID)
fn generate_tid() -> String {
    const CHARSET: &[u8] = b"234567abcdefghijklmnopqrstuvwxyz";
    let mut rng = rand::thread_rng();
    (0..13)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Put a record to ATProto
pub async fn put_record(file: &str, collection: &str, rkey: Option<&str>) -> Result<()> {
    let session = auth::refresh_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");

    let content = fs::read_to_string(file)
        .with_context(|| format!("Failed to read file: {}", file))?;
    let record: Value = serde_json::from_str(&content)?;

    let rkey = rkey.map(|s| s.to_string()).unwrap_or_else(generate_tid);

    let client = reqwest::Client::new();
    let url = lexicons::url(pds, &com_atproto_repo::PUT_RECORD);

    let req = PutRecordRequest {
        repo: session.did.clone(),
        collection: collection.to_string(),
        rkey: rkey.clone(),
        record,
    };

    println!("Posting to {} with rkey: {}", collection, rkey);
    println!("{}", serde_json::to_string_pretty(&req)?);

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", session.access_jwt))
        .json(&req)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("Put record failed: {} - {}", status, body);
    }

    let result: PutRecordResponse = res.json().await?;
    println!("Success!");
    println!("  URI: {}", result.uri);
    println!("  CID: {}", result.cid);

    Ok(())
}

/// Put a lexicon schema
pub async fn put_lexicon(file: &str) -> Result<()> {
    let session = auth::refresh_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");

    let content = fs::read_to_string(file)
        .with_context(|| format!("Failed to read file: {}", file))?;
    let lexicon: Value = serde_json::from_str(&content)?;

    let lexicon_id = lexicon["id"]
        .as_str()
        .context("Lexicon file must have 'id' field")?
        .to_string();

    let client = reqwest::Client::new();
    let url = lexicons::url(pds, &com_atproto_repo::PUT_RECORD);

    let req = PutRecordRequest {
        repo: session.did.clone(),
        collection: "com.atproto.lexicon.schema".to_string(),
        rkey: lexicon_id.clone(),
        record: lexicon,
    };

    println!("Putting lexicon: {}", lexicon_id);
    println!("{}", serde_json::to_string_pretty(&req)?);

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", session.access_jwt))
        .json(&req)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("Put lexicon failed: {} - {}", status, body);
    }

    let result: PutRecordResponse = res.json().await?;
    println!("Success!");
    println!("  URI: {}", result.uri);
    println!("  CID: {}", result.cid);

    Ok(())
}

/// Get records from a collection
pub async fn get_records(collection: &str, limit: u32) -> Result<()> {
    let session = auth::refresh_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");

    let client = reqwest::Client::new();
    let base_url = lexicons::url(pds, &com_atproto_repo::LIST_RECORDS);
    let url = format!(
        "{}?repo={}&collection={}&limit={}",
        base_url, session.did, collection, limit
    );

    let res = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", session.access_jwt))
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("Get records failed: {} - {}", status, body);
    }

    let result: ListRecordsResponse = res.json().await?;

    println!("Found {} records in {}", result.records.len(), collection);
    for record in &result.records {
        println!("---");
        println!("URI: {}", record.uri);
        println!("CID: {}", record.cid);
        println!("{}", serde_json::to_string_pretty(&record.value)?);
    }

    Ok(())
}

/// Delete a record
pub async fn delete_record(collection: &str, rkey: &str) -> Result<()> {
    let session = auth::refresh_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");

    let client = reqwest::Client::new();
    let url = lexicons::url(pds, &com_atproto_repo::DELETE_RECORD);

    let req = DeleteRecordRequest {
        repo: session.did.clone(),
        collection: collection.to_string(),
        rkey: rkey.to_string(),
    };

    println!("Deleting {} from {}", rkey, collection);

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", session.access_jwt))
        .json(&req)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("Delete failed: {} - {}", status, body);
    }

    println!("Deleted successfully");

    Ok(())
}

#[derive(Debug, Deserialize)]
struct Config {
    handle: String,
    #[serde(default)]
    collection: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DescribeRepoResponse {
    did: String,
    handle: String,
    collections: Vec<String>,
}

/// Sync PDS data to local content directory
pub async fn sync_to_local(output: &str, is_bot: bool, collection_override: Option<&str>) -> Result<()> {
    let client = reqwest::Client::new();

    let (did, pds, _handle, collection) = if is_bot {
        // Bot mode: use bot.json
        let session = token::load_bot_session()?;
        let pds = session.pds.as_deref().unwrap_or("bsky.social");
        let collection = collection_override.unwrap_or("ai.syui.log.chat");
        println!("Syncing bot data for {} ({})", session.handle, session.did);
        (session.did.clone(), format!("https://{}", pds), session.handle.clone(), collection.to_string())
    } else {
        // User mode: use config.json
        let config_content = fs::read_to_string("public/config.json")
            .context("config.json not found")?;
        let config: Config = serde_json::from_str(&config_content)?;

        println!("Syncing data for {}", config.handle);

        // Resolve handle to DID
        let resolve_url = format!(
            "{}?handle={}",
            lexicons::url("public.api.bsky.app", &com_atproto_identity::RESOLVE_HANDLE),
            config.handle
        );
        let res = client.get(&resolve_url).send().await?;
        let resolve: serde_json::Value = res.json().await?;
        let did = resolve["did"].as_str().context("Could not resolve handle")?.to_string();

        // Get PDS from DID document
        let plc_url = format!("https://plc.directory/{}", did);
        let res = client.get(&plc_url).send().await?;
        let did_doc: serde_json::Value = res.json().await?;
        let pds = did_doc["service"]
            .as_array()
            .and_then(|services| {
                services.iter().find(|s| s["type"] == "AtprotoPersonalDataServer")
            })
            .and_then(|s| s["serviceEndpoint"].as_str())
            .context("Could not find PDS")?
            .to_string();

        let collection = collection_override
            .map(|s| s.to_string())
            .unwrap_or_else(|| config.collection.as_deref().unwrap_or("ai.syui.log.post").to_string());

        (did, pds, config.handle.clone(), collection)
    };

    println!("DID: {}", did);
    println!("PDS: {}", pds);

    // Remove https:// prefix for lexicons::url
    let pds_host = pds.trim_start_matches("https://");

    // Create output directory
    let did_dir = format!("{}/{}", output, did);
    fs::create_dir_all(&did_dir)?;

    // 1. Sync describeRepo
    let describe_url = format!(
        "{}?repo={}",
        lexicons::url(pds_host, &com_atproto_repo::DESCRIBE_REPO),
        did
    );
    let res = client.get(&describe_url).send().await?;
    let describe: DescribeRepoResponse = res.json().await?;

    let describe_path = format!("{}/describe.json", did_dir);
    let describe_json = serde_json::to_string_pretty(&serde_json::json!({
        "did": describe.did,
        "handle": describe.handle,
        "collections": describe.collections,
    }))?;
    fs::write(&describe_path, &describe_json)?;
    println!("Saved: {}", describe_path);

    // 2. Sync profile
    let profile_url = format!(
        "{}?repo={}&collection=app.bsky.actor.profile&rkey=self",
        lexicons::url(pds_host, &com_atproto_repo::GET_RECORD),
        did
    );
    let res = client.get(&profile_url).send().await?;
    if res.status().is_success() {
        let profile: serde_json::Value = res.json().await?;
        let profile_dir = format!("{}/app.bsky.actor.profile", did_dir);
        fs::create_dir_all(&profile_dir)?;
        let profile_path = format!("{}/self.json", profile_dir);
        fs::write(&profile_path, serde_json::to_string_pretty(&profile)?)?;
        println!("Saved: {}", profile_path);

        // Download avatar blob if present
        if let Some(avatar_cid) = profile["value"]["avatar"]["ref"]["$link"].as_str() {
            let blob_dir = format!("{}/blob", did_dir);
            fs::create_dir_all(&blob_dir)?;
            let blob_path = format!("{}/{}", blob_dir, avatar_cid);

            let blob_url = format!(
                "{}/xrpc/com.atproto.sync.getBlob?did={}&cid={}",
                pds, did, avatar_cid
            );
            println!("Downloading avatar: {}", avatar_cid);
            let blob_res = client.get(&blob_url).send().await?;
            if blob_res.status().is_success() {
                let blob_bytes = blob_res.bytes().await?;
                fs::write(&blob_path, &blob_bytes)?;
                println!("Saved: {}", blob_path);
            } else {
                println!("Failed to download avatar: {}", blob_res.status());
            }
        }
    }

    // 3. Sync collection records
    let records_url = format!(
        "{}?repo={}&collection={}&limit=100",
        lexicons::url(pds_host, &com_atproto_repo::LIST_RECORDS),
        did, collection
    );
    let res = client.get(&records_url).send().await?;
    if res.status().is_success() {
        let list: ListRecordsResponse = res.json().await?;
        let collection_dir = format!("{}/{}", did_dir, collection);
        fs::create_dir_all(&collection_dir)?;

        let mut rkeys: Vec<String> = Vec::new();
        for record in &list.records {
            let rkey = record.uri.split('/').last().unwrap_or("unknown");
            rkeys.push(rkey.to_string());
            let record_path = format!("{}/{}.json", collection_dir, rkey);
            let record_json = serde_json::json!({
                "uri": record.uri,
                "cid": record.cid,
                "value": record.value,
            });
            fs::write(&record_path, serde_json::to_string_pretty(&record_json)?)?;
            println!("Saved: {}", record_path);
        }

        // Create index.json with list of rkeys
        let index_path = format!("{}/index.json", collection_dir);
        fs::write(&index_path, serde_json::to_string_pretty(&rkeys)?)?;
        println!("Saved: {}", index_path);

        println!("Synced {} records from {}", list.records.len(), collection);
    }

    println!("Sync complete!");

    Ok(())
}

/// Push local content to PDS
pub async fn push_to_remote(input: &str, collection: &str, is_bot: bool) -> Result<()> {
    let session = if is_bot {
        auth::refresh_bot_session().await?
    } else {
        auth::refresh_session().await?
    };
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let did = &session.did;

    // Build collection directory path
    let collection_dir = format!("{}/{}/{}", input, did, collection);

    if !std::path::Path::new(&collection_dir).exists() {
        anyhow::bail!("Collection directory not found: {}", collection_dir);
    }

    println!("Pushing records from {} to {}", collection_dir, collection);

    let client = reqwest::Client::new();
    let url = lexicons::url(pds, &com_atproto_repo::PUT_RECORD);

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

        let res = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", session.access_jwt))
            .json(&req)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            println!("  Failed: {} - {}", status, body);
        } else {
            let result: PutRecordResponse = res.json().await?;
            println!("  OK: {}", result.uri);
            count += 1;
        }
    }

    println!("Pushed {} records to {}", count, collection);

    Ok(())
}
