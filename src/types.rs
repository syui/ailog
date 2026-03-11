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
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    pub identifier: String,
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_factor_token: Option<String>,
}

/// ATProto requestEmailUpdate response
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestEmailUpdateResponse {
    pub token_required: bool,
}

/// ATProto updateEmail request
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEmailRequest {
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_auth_factor: Option<bool>,
}

/// ATProto getSession response
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSessionResponse {
    #[allow(dead_code)]
    pub did: String,
    pub handle: String,
    pub email: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    pub email_confirmed: bool,
    #[serde(default)]
    pub email_auth_factor: bool,
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
