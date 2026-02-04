use anyhow::{Context, Result};
use serde_json::Value;
use std::fs;

use super::auth;
use crate::lexicons::com_atproto_repo;
use crate::tid;
use crate::types::{
    DeleteRecordRequest, ListRecordsResponse, PutRecordRequest, PutRecordResponse,
};
use crate::xrpc::XrpcClient;

/// Put a record to ATProto
pub async fn put_record(file: &str, collection: &str, rkey: Option<&str>) -> Result<()> {
    let session = auth::refresh_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let client = XrpcClient::new(pds);

    let content = fs::read_to_string(file)
        .with_context(|| format!("Failed to read file: {}", file))?;
    let record: Value = serde_json::from_str(&content)?;

    let rkey = rkey
        .map(|s| s.to_string())
        .unwrap_or_else(tid::generate_tid);

    let req = PutRecordRequest {
        repo: session.did.clone(),
        collection: collection.to_string(),
        rkey: rkey.clone(),
        record,
    };

    println!("Posting to {} with rkey: {}", collection, rkey);
    println!("{}", serde_json::to_string_pretty(&req)?);

    let result: PutRecordResponse = client
        .call(&com_atproto_repo::PUT_RECORD, &req, &session.access_jwt)
        .await?;

    println!("Success!");
    println!("  URI: {}", result.uri);
    println!("  CID: {}", result.cid);

    Ok(())
}

/// Put a lexicon schema
pub async fn put_lexicon(file: &str) -> Result<()> {
    let session = auth::refresh_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let client = XrpcClient::new(pds);

    let content = fs::read_to_string(file)
        .with_context(|| format!("Failed to read file: {}", file))?;
    let lexicon: Value = serde_json::from_str(&content)?;

    let lexicon_id = lexicon["id"]
        .as_str()
        .context("Lexicon file must have 'id' field")?
        .to_string();

    let req = PutRecordRequest {
        repo: session.did.clone(),
        collection: "com.atproto.lexicon.schema".to_string(),
        rkey: lexicon_id.clone(),
        record: lexicon,
    };

    println!("Putting lexicon: {}", lexicon_id);
    println!("{}", serde_json::to_string_pretty(&req)?);

    let result: PutRecordResponse = client
        .call(&com_atproto_repo::PUT_RECORD, &req, &session.access_jwt)
        .await?;

    println!("Success!");
    println!("  URI: {}", result.uri);
    println!("  CID: {}", result.cid);

    Ok(())
}

/// Get records from a collection
pub async fn get_records(collection: &str, limit: u32) -> Result<()> {
    let session = auth::refresh_session().await?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");
    let client = XrpcClient::new(pds);
    let limit_str = limit.to_string();

    let result: ListRecordsResponse = client
        .query_auth(
            &com_atproto_repo::LIST_RECORDS,
            &[
                ("repo", &session.did),
                ("collection", collection),
                ("limit", &limit_str),
            ],
            &session.access_jwt,
        )
        .await?;

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
    let client = XrpcClient::new(pds);

    let req = DeleteRecordRequest {
        repo: session.did.clone(),
        collection: collection.to_string(),
        rkey: rkey.to_string(),
    };

    println!("Deleting {} from {}", rkey, collection);

    client
        .call_no_response(&com_atproto_repo::DELETE_RECORD, &req, &session.access_jwt)
        .await?;

    println!("Deleted successfully");

    Ok(())
}
