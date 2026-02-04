use serde::{Deserialize, Serialize};
use serde_json::Value;

/// ATProto putRecord request body
#[derive(Debug, Serialize)]
pub struct PutRecordRequest {
    pub repo: String,
    pub collection: String,
    pub rkey: String,
    pub record: Value,
}

/// ATProto deleteRecord request body
#[derive(Debug, Serialize)]
pub struct DeleteRecordRequest {
    pub repo: String,
    pub collection: String,
    pub rkey: String,
}

/// ATProto putRecord response
#[derive(Debug, Deserialize)]
pub struct PutRecordResponse {
    pub uri: String,
    pub cid: String,
}

/// ATProto listRecords response
#[derive(Debug, Deserialize)]
pub struct ListRecordsResponse {
    pub records: Vec<Record>,
    #[serde(default)]
    #[allow(dead_code)]
    pub cursor: Option<String>,
}

/// A single ATProto record (from listRecords / getRecord)
#[derive(Debug, Deserialize)]
pub struct Record {
    pub uri: String,
    pub cid: String,
    pub value: Value,
}

/// ATProto describeRepo response
#[derive(Debug, Deserialize)]
pub struct DescribeRepoResponse {
    pub did: String,
    pub handle: String,
    pub collections: Vec<String>,
}

/// ATProto createSession request
#[derive(Debug, Serialize)]
pub struct CreateSessionRequest {
    pub identifier: String,
    pub password: String,
}

/// ATProto createSession / refreshSession response
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionResponse {
    pub did: String,
    pub handle: String,
    pub access_jwt: String,
    pub refresh_jwt: String,
}

/// Local config.json structure
#[derive(Debug, Deserialize)]
pub struct Config {
    pub handle: String,
    #[serde(default)]
    pub collection: Option<String>,
}
