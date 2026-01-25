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

pub async fn check_versions(networks_path: &str) -> Result<()> {
    // Read networks.json
    let content = std::fs::read_to_string(networks_path)?;
    let networks: HashMap<String, Network> = serde_json::from_str(&content)?;

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
