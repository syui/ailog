use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConfig {
    pub pds_api: String,
    pub plc_api: String,
    pub bsky_api: String,
    pub web_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoDescription {
    pub did: String,
    pub handle: String,
    #[serde(rename = "didDoc")]
    pub did_doc: DidDoc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DidDoc {
    pub service: Vec<Service>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Service {
    #[serde(rename = "serviceEndpoint")]
    pub service_endpoint: String,
}

pub struct ProfileFetcher {
    client: reqwest::Client,
}

impl ProfileFetcher {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    /// Get network configuration based on PDS
    pub fn get_network_config(pds: &str) -> NetworkConfig {
        match pds {
            "bsky.social" | "bsky.app" => NetworkConfig {
                pds_api: format!("https://{}", pds),
                plc_api: "https://plc.directory".to_string(),
                bsky_api: "https://public.api.bsky.app".to_string(),
                web_url: "https://bsky.app".to_string(),
            },
            "syu.is" => NetworkConfig {
                pds_api: "https://syu.is".to_string(),
                plc_api: "https://plc.syu.is".to_string(),
                bsky_api: "https://bsky.syu.is".to_string(),
                web_url: "https://web.syu.is".to_string(),
            },
            _ => {
                // Default to Bluesky network for unknown PDS
                NetworkConfig {
                    pds_api: format!("https://{}", pds),
                    plc_api: "https://plc.directory".to_string(),
                    bsky_api: "https://public.api.bsky.app".to_string(),
                    web_url: "https://bsky.app".to_string(),
                }
            }
        }
    }

    /// Fetch DID and PDS from handle
    pub async fn describe_repo(&self, handle: &str, pds: &str) -> Result<RepoDescription> {
        let network_config = Self::get_network_config(pds);
        let url = format!("{}/xrpc/com.atproto.repo.describeRepo", network_config.pds_api);
        
        let response = self.client
            .get(&url)
            .query(&[("repo", handle)])
            .send()
            .await?;
        
        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to describe repo: {}", response.status()));
        }
        
        let repo_desc: RepoDescription = response.json().await?;
        Ok(repo_desc)
    }

    /// Get user's PDS from their DID document
    pub fn extract_pds_from_repo_desc(repo_desc: &RepoDescription) -> Option<String> {
        repo_desc.did_doc.service.first().map(|service| {
            // Extract hostname from service endpoint
            let endpoint = &service.service_endpoint;
            if let Some(url) = endpoint.strip_prefix("https://") {
                if let Some(host) = url.split('/').next() {
                    return host.to_string();
                }
            }
            endpoint.clone()
        })
    }

    /// Fetch profile from bsky API
    pub async fn get_profile(&self, did: &str, pds: &str) -> Result<Profile> {
        let network_config = Self::get_network_config(pds);
        let url = format!("{}/xrpc/app.bsky.actor.getProfile", network_config.bsky_api);
        
        let response = self.client
            .get(&url)
            .query(&[("actor", did)])
            .send()
            .await?;
        
        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to get profile: {}", response.status()));
        }
        
        let profile_data: Value = response.json().await?;
        
        let profile = Profile {
            did: did.to_string(),
            handle: profile_data["handle"].as_str().unwrap_or("").to_string(),
            display_name: profile_data["displayName"].as_str().map(|s| s.to_string()),
            avatar: profile_data["avatar"].as_str().map(|s| s.to_string()),
            description: profile_data["description"].as_str().map(|s| s.to_string()),
        };
        
        Ok(profile)
    }

    /// Fetch complete profile information from handle and PDS
    pub async fn fetch_profile_from_handle(&self, handle: &str, pds: &str) -> Result<Profile> {
        println!("🔍 Fetching profile for handle: {} from PDS: {}", handle, pds);
        
        // First, get DID from handle
        let repo_desc = self.describe_repo(handle, pds).await?;
        let did = repo_desc.did.clone();
        
        // Determine the actual PDS from the DID document
        let actual_pds = Self::extract_pds_from_repo_desc(&repo_desc)
            .unwrap_or_else(|| pds.to_string());
        
        println!("📍 Found DID: {} with PDS: {}", did, actual_pds);
        
        // Get profile from the actual PDS
        let profile = self.get_profile(&did, &actual_pds).await?;
        
        println!("✅ Profile fetched: {} ({})", profile.display_name.as_deref().unwrap_or(&profile.handle), profile.did);
        
        Ok(profile)
    }

    /// Generate profile URL for a given DID and PDS
    pub fn generate_profile_url(did: &str, pds: &str) -> String {
        let network_config = Self::get_network_config(pds);
        match pds {
            "syu.is" => format!("https://syu.is/profile/{}", did),
            _ => format!("{}/profile/{}", network_config.web_url, did),
        }
    }

    /// Convert Profile to JSON format used by the application
    pub fn profile_to_json(&self, profile: &Profile, _pds: &str) -> Value {
        serde_json::json!({
            "did": profile.did,
            "handle": profile.handle,
            "displayName": profile.display_name.as_deref().unwrap_or(&profile.handle),
            "avatar": profile.avatar.as_deref().unwrap_or(&format!("https://bsky.syu.is/img/avatar/plain/{}/default@jpeg", profile.did))
        })
    }
}

impl Default for ProfileFetcher {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_config() {
        let config = ProfileFetcher::get_network_config("syu.is");
        assert_eq!(config.pds_api, "https://syu.is");
        assert_eq!(config.bsky_api, "https://bsky.syu.is");
        
        let config = ProfileFetcher::get_network_config("bsky.social");
        assert_eq!(config.pds_api, "https://bsky.social");
        assert_eq!(config.bsky_api, "https://public.api.bsky.app");
    }

    #[test]
    fn test_profile_url_generation() {
        let did = "did:plc:test123";
        
        let url = ProfileFetcher::generate_profile_url(did, "syu.is");
        assert_eq!(url, "https://syu.is/profile/did:plc:test123");
        
        let url = ProfileFetcher::generate_profile_url(did, "bsky.social");
        assert_eq!(url, "https://bsky.app/profile/did:plc:test123");
    }
}