use anyhow::{Context, Result};
use std::fs;

use super::token;
use crate::lexicons::{self, com_atproto_identity, com_atproto_repo};
use crate::types::{Config, DescribeRepoResponse, ListRecordsResponse};

/// Sync PDS data to local content directory
pub async fn sync_to_local(
    output: &str,
    is_bot: bool,
    collection_override: Option<&str>,
) -> Result<()> {
    let client = reqwest::Client::new();

    let (did, pds, _handle, collection) = if is_bot {
        // Bot mode: use bot.json
        let session = token::load_bot_session()?;
        let pds = session.pds.as_deref().unwrap_or("bsky.social");
        let collection = collection_override.unwrap_or("ai.syui.log.chat");
        println!(
            "Syncing bot data for {} ({})",
            session.handle, session.did
        );
        (
            session.did.clone(),
            format!("https://{}", pds),
            session.handle.clone(),
            collection.to_string(),
        )
    } else {
        // User mode: use config.json
        let config_content =
            fs::read_to_string("public/config.json").context("config.json not found")?;
        let config: Config = serde_json::from_str(&config_content)?;

        println!("Syncing data for {}", config.handle);

        // Resolve handle to DID
        let resolve_url = format!(
            "{}?handle={}",
            lexicons::url(
                "public.api.bsky.app",
                &com_atproto_identity::RESOLVE_HANDLE
            ),
            config.handle
        );
        let res = client.get(&resolve_url).send().await?;
        let resolve: serde_json::Value = res.json().await?;
        let did = resolve["did"]
            .as_str()
            .context("Could not resolve handle")?
            .to_string();

        // Get PDS from DID document
        let plc_url = format!("https://plc.directory/{}", did);
        let res = client.get(&plc_url).send().await?;
        let did_doc: serde_json::Value = res.json().await?;
        let pds = did_doc["service"]
            .as_array()
            .and_then(|services| {
                services
                    .iter()
                    .find(|s| s["type"] == "AtprotoPersonalDataServer")
            })
            .and_then(|s| s["serviceEndpoint"].as_str())
            .context("Could not find PDS")?
            .to_string();

        let collection = collection_override
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                config
                    .collection
                    .as_deref()
                    .unwrap_or("ai.syui.log.post")
                    .to_string()
            });

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
        did,
        collection
    );
    let res = client.get(&records_url).send().await?;
    if res.status().is_success() {
        let list: ListRecordsResponse = res.json().await?;
        let collection_dir = format!("{}/{}", did_dir, collection);
        fs::create_dir_all(&collection_dir)?;

        let mut rkeys: Vec<String> = Vec::new();
        for record in &list.records {
            let rkey = record.uri.split('/').next_back().unwrap_or("unknown");
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

        println!(
            "Synced {} records from {}",
            list.records.len(),
            collection
        );
    }

    println!("Sync complete!");

    Ok(())
}
