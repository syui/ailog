use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct Network {
    plc: String,
    bsky: String,
    web: Option<String>,
    #[serde(rename = "handleDomains")]
    handle_domains: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct HealthResponse {
    version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PackageJson {
    dependencies: Option<HashMap<String, String>>,
}

const PDS_PACKAGE_URL: &str = "https://raw.githubusercontent.com/bluesky-social/pds/main/service/package.json";

const DEFAULT_NETWORKS: &str = r#"{
  "bsky.social": {
    "plc": "https://plc.directory",
    "bsky": "https://public.api.bsky.app",
    "web": "https://bsky.app",
    "handleDomains": ["bsky.social"]
  },
  "syu.is": {
    "plc": "https://plc.syu.is",
    "bsky": "https://bsky.syu.is",
    "web": "https://syu.is",
    "handleDomains": ["syu.is", "syui.ai"]
  }
}"#;

async fn get_latest_version(client: &reqwest::Client) -> String {
    if let Ok(res) = client.get(PDS_PACKAGE_URL).send().await {
        if res.status().is_success() {
            if let Ok(pkg) = res.json::<PackageJson>().await {
                if let Some(deps) = pkg.dependencies {
                    if let Some(v) = deps.get("@atproto/pds") {
                        return v.clone();
                    }
                }
            }
        }
    }

    "N/A".to_string()
}

fn load_networks(networks_path: &str) -> Result<HashMap<String, Network>> {
    // 1. Try specified path
    if let Ok(content) = std::fs::read_to_string(networks_path) {
        return Ok(serde_json::from_str(&content)?);
    }

    // 2. Try ~/.config/ai.syui.log/networks.json
    if let Some(config_dir) = dirs::config_dir() {
        let config_path = config_dir.join("ai.syui.log").join("networks.json");
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            return Ok(serde_json::from_str(&content)?);
        }
    }

    // 3. Fall back to built-in default
    Ok(serde_json::from_str(DEFAULT_NETWORKS)?)
}

pub async fn check_versions(networks_path: &str) -> Result<()> {
    let networks = load_networks(networks_path)?;

    let client = reqwest::Client::new();

    // Get latest version from GitHub
    let latest = get_latest_version(&client).await;
    println!("latest: {}", latest);
    println!();

    for (name, _network) in &networks {
        // Check PDS using network name as domain
        let url = format!("https://{}/xrpc/_health", name);
        let version = match client.get(&url).send().await {
            Ok(res) => {
                if res.status().is_success() {
                    match res.json::<HealthResponse>().await {
                        Ok(health) => health.version.unwrap_or_else(|| "-".to_string()),
                        Err(_) => "-".to_string(),
                    }
                } else {
                    "-".to_string()
                }
            }
            Err(_) => "-".to_string(),
        };
        println!("{}: {}", name, version);
    }

    Ok(())
}
