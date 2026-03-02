use anyhow::{Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ring::rand::SecureRandom;
use ring::signature::{EcdsaKeyPair, ECDSA_P256_SHA256_FIXED_SIGNING, KeyPair};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, Write};

use super::token::{self, Session, BUNDLE_ID};

#[derive(Debug, Deserialize)]
struct SiteConfig {
    #[serde(rename = "siteUrl")]
    site_url: Option<String>,
}

fn load_site_url() -> Result<String> {
    // 1. Try public/config.json in current directory
    let local_path = std::path::Path::new("public/config.json");
    if local_path.exists() {
        let content = std::fs::read_to_string(local_path)?;
        let config: SiteConfig = serde_json::from_str(&content)?;
        if let Some(url) = config.site_url {
            return Ok(url.trim_end_matches('/').to_string());
        }
    }

    // 2. Fallback to ~/.config/ai.syui.log/config.json
    if let Some(cfg_dir) = dirs::config_dir() {
        let cfg_path = cfg_dir.join(BUNDLE_ID).join("config.json");
        if cfg_path.exists() {
            let content = std::fs::read_to_string(&cfg_path)?;
            let config: SiteConfig = serde_json::from_str(&content)?;
            if let Some(url) = config.site_url {
                return Ok(url.trim_end_matches('/').to_string());
            }
        }
    }

    anyhow::bail!(
        "No siteUrl found. Create public/config.json or run ailog oauth with --client-id"
    );
}


fn percent_encode(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", b));
            }
        }
    }
    result
}

// --- Data types ---

#[derive(Debug, Deserialize)]
struct AuthServerMetadata {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    pushed_authorization_request_endpoint: String,
}

#[derive(Debug, Deserialize)]
struct ParResponse {
    request_uri: String,
    #[allow(dead_code)]
    expires_in: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    token_type: String,
    #[allow(dead_code)]
    expires_in: Option<u64>,
    sub: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenErrorResponse {
    error: String,
    #[allow(dead_code)]
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DidDocument {
    id: String,
    #[serde(default)]
    service: Vec<DidService>,
}

#[derive(Debug, Deserialize)]
struct DidService {
    id: String,
    #[serde(rename = "type")]
    service_type: String,
    #[serde(rename = "serviceEndpoint")]
    service_endpoint: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct DpopJwk {
    kty: String,
    crv: String,
    x: String,
    y: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthSession {
    pub did: String,
    pub handle: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub pds: String,
    pub token_endpoint: String,
    pub issuer: String,
    dpop_pkcs8: String,
    dpop_jwk: DpopJwk,
}

// --- Handle / DID / PDS resolution ---

async fn resolve_handle_to_did(handle: &str) -> Result<String> {
    let client = reqwest::Client::new();

    // Try DNS TXT _atproto.{handle} first is complex; use HTTPS resolution
    let url = format!(
        "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle={}",
        handle
    );
    let res = client.get(&url).send().await?;
    if !res.status().is_success() {
        anyhow::bail!("Failed to resolve handle '{}': {}", handle, res.status());
    }

    #[derive(Deserialize)]
    struct R {
        did: String,
    }
    let r: R = res.json().await?;
    Ok(r.did)
}

async fn resolve_did_to_pds(did: &str) -> Result<(String, String)> {
    let client = reqwest::Client::new();

    let doc: DidDocument = if did.starts_with("did:plc:") {
        let url = format!("https://plc.directory/{}", did);
        let res = client.get(&url).send().await?;
        if !res.status().is_success() {
            anyhow::bail!("Failed to resolve DID '{}': {}", did, res.status());
        }
        res.json().await?
    } else if did.starts_with("did:web:") {
        let domain = did.strip_prefix("did:web:").unwrap();
        let url = format!("https://{}/.well-known/did.json", domain);
        let res = client.get(&url).send().await?;
        res.json().await?
    } else {
        anyhow::bail!("Unsupported DID method: {}", did);
    };

    // Find AtprotoPersonalDataServer service
    let pds_endpoint = doc
        .service
        .iter()
        .find(|s| s.id == "#atproto_pds" || s.service_type == "AtprotoPersonalDataServer")
        .map(|s| s.service_endpoint.clone())
        .context("No PDS service found in DID document")?;

    Ok((doc.id, pds_endpoint))
}

// --- OAuth metadata ---

async fn fetch_auth_server_metadata(pds_url: &str) -> Result<AuthServerMetadata> {
    let client = reqwest::Client::new();
    let base = pds_url.trim_end_matches('/');

    // Try PDS's own .well-known/oauth-authorization-server first
    let url = format!("{}/.well-known/oauth-authorization-server", base);
    let res = client.get(&url).send().await?;
    if res.status().is_success() {
        if let Ok(meta) = res.json::<AuthServerMetadata>().await {
            return Ok(meta);
        }
    }

    // Fallback: check oauth-protected-resource for authorization_servers
    let pr_url = format!("{}/.well-known/oauth-protected-resource", base);
    let pr_res = client.get(&pr_url).send().await?;
    if pr_res.status().is_success() {
        #[derive(Deserialize)]
        struct ProtectedResource {
            authorization_servers: Vec<String>,
        }
        if let Ok(pr) = pr_res.json::<ProtectedResource>().await {
            for auth_server in &pr.authorization_servers {
                let as_url = format!(
                    "{}/.well-known/oauth-authorization-server",
                    auth_server.trim_end_matches('/')
                );
                let as_res = client.get(&as_url).send().await?;
                if as_res.status().is_success() {
                    return Ok(as_res.json().await?);
                }
            }
        }
    }

    anyhow::bail!(
        "Failed to fetch OAuth authorization server metadata for {}",
        base
    );
}

// --- PKCE ---

fn generate_pkce() -> Result<(String, String)> {
    let rng = ring::rand::SystemRandom::new();
    let mut verifier_bytes = [0u8; 32];
    rng.fill(&mut verifier_bytes)
        .map_err(|_| anyhow::anyhow!("Failed to generate random bytes"))?;

    let code_verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    let challenge_hash = ring::digest::digest(&ring::digest::SHA256, code_verifier.as_bytes());
    let code_challenge = URL_SAFE_NO_PAD.encode(challenge_hash.as_ref());

    Ok((code_verifier, code_challenge))
}

// --- DPoP key pair ---

struct DpopKey {
    pkcs8_bytes: Vec<u8>,
    jwk: DpopJwk,
}

fn generate_dpop_keypair() -> Result<DpopKey> {
    let rng = ring::rand::SystemRandom::new();
    let pkcs8 = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &rng)
        .map_err(|e| anyhow::anyhow!("Failed to generate ECDSA key: {}", e))?;

    let key_pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, pkcs8.as_ref(), &rng)
        .map_err(|e| anyhow::anyhow!("Failed to parse generated key: {}", e))?;

    // Extract public key (uncompressed: 0x04 || x(32) || y(32))
    let pub_key = key_pair.public_key().as_ref();
    assert!(pub_key.len() == 65 && pub_key[0] == 0x04);
    let x = URL_SAFE_NO_PAD.encode(&pub_key[1..33]);
    let y = URL_SAFE_NO_PAD.encode(&pub_key[33..65]);

    Ok(DpopKey {
        pkcs8_bytes: pkcs8.as_ref().to_vec(),
        jwk: DpopJwk {
            kty: "EC".to_string(),
            crv: "P-256".to_string(),
            x,
            y,
        },
    })
}

// --- DPoP proof JWT ---

fn create_dpop_proof(
    pkcs8_bytes: &[u8],
    jwk: &DpopJwk,
    method: &str,
    url: &str,
    nonce: Option<&str>,
    ath: Option<&str>,
) -> Result<String> {
    let rng = ring::rand::SystemRandom::new();
    let key_pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, pkcs8_bytes, &rng)
        .map_err(|e| anyhow::anyhow!("Failed to load DPoP key: {}", e))?;

    // Header
    let header = serde_json::json!({
        "typ": "dpop+jwt",
        "alg": "ES256",
        "jwk": {
            "kty": &jwk.kty,
            "crv": &jwk.crv,
            "x": &jwk.x,
            "y": &jwk.y,
        }
    });

    // Generate jti
    let mut jti_bytes = [0u8; 16];
    rng.fill(&mut jti_bytes)
        .map_err(|_| anyhow::anyhow!("Failed to generate jti"))?;
    let jti = URL_SAFE_NO_PAD.encode(jti_bytes);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();

    let mut payload = serde_json::json!({
        "jti": jti,
        "htm": method,
        "htu": url,
        "iat": now,
        "exp": now + 120,
    });

    if let Some(n) = nonce {
        payload["nonce"] = serde_json::Value::String(n.to_string());
    }
    if let Some(a) = ath {
        payload["ath"] = serde_json::Value::String(a.to_string());
    }

    let header_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_string(&header)?.as_bytes());
    let payload_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_string(&payload)?.as_bytes());

    let signing_input = format!("{}.{}", header_b64, payload_b64);
    let signature = key_pair
        .sign(&rng, signing_input.as_bytes())
        .map_err(|e| anyhow::anyhow!("Failed to sign DPoP proof: {}", e))?;

    // ECDSA_P256_SHA256_FIXED_SIGNING produces r||s (64 bytes), which is exactly what JWS ES256 needs
    let sig_b64 = URL_SAFE_NO_PAD.encode(signature.as_ref());

    Ok(format!("{}.{}", signing_input, sig_b64))
}

// --- PAR ---

async fn pushed_authorization_request(
    par_endpoint: &str,
    client_id: &str,
    redirect_uri: &str,
    code_challenge: &str,
    scope: &str,
    login_hint: &str,
    dpop_key: &DpopKey,
) -> Result<ParResponse> {
    let client = reqwest::Client::new();

    let mut dpop_nonce: Option<String> = None;

    // Try up to 2 times (initial + nonce retry)
    for attempt in 0..2 {
        let dpop_proof = create_dpop_proof(
            &dpop_key.pkcs8_bytes,
            &dpop_key.jwk,
            "POST",
            par_endpoint,
            dpop_nonce.as_deref(),
            None,
        )?;

        let params = [
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("code_challenge", code_challenge),
            ("code_challenge_method", "S256"),
            ("response_type", "code"),
            ("scope", scope),
            ("login_hint", login_hint),
            ("state", "cli"),
        ];

        let res = client
            .post(par_endpoint)
            .header("DPoP", &dpop_proof)
            .form(&params)
            .send()
            .await?;

        if res.status().is_success() {
            return Ok(res.json().await?);
        }

        // Check for use_dpop_nonce error
        let nonce_header = res
            .headers()
            .get("dpop-nonce")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let body = res.text().await?;

        if attempt == 0 {
            if let Some(nonce) = nonce_header {
                // Check if it's a dpop nonce error
                if body.contains("use_dpop_nonce") {
                    dpop_nonce = Some(nonce);
                    continue;
                }
            }
        }

        anyhow::bail!("PAR request failed: {}", body);
    }

    anyhow::bail!("PAR request failed after nonce retry");
}

// --- Token exchange ---

async fn exchange_code(
    token_endpoint: &str,
    client_id: &str,
    redirect_uri: &str,
    code: &str,
    code_verifier: &str,
    dpop_key: &DpopKey,
    initial_nonce: Option<&str>,
) -> Result<(TokenResponse, Option<String>)> {
    let client = reqwest::Client::new();

    let mut dpop_nonce = initial_nonce.map(|s| s.to_string());

    for attempt in 0..2 {
        let dpop_proof = create_dpop_proof(
            &dpop_key.pkcs8_bytes,
            &dpop_key.jwk,
            "POST",
            token_endpoint,
            dpop_nonce.as_deref(),
            None,
        )?;

        let mut params = HashMap::new();
        params.insert("grant_type", "authorization_code");
        params.insert("client_id", client_id);
        params.insert("redirect_uri", redirect_uri);
        params.insert("code", code);
        params.insert("code_verifier", code_verifier);

        let res = client
            .post(token_endpoint)
            .header("DPoP", &dpop_proof)
            .form(&params)
            .send()
            .await?;

        let new_nonce = res
            .headers()
            .get("dpop-nonce")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        if res.status().is_success() {
            let token_res: TokenResponse = res.json().await?;
            return Ok((token_res, new_nonce.or(dpop_nonce)));
        }

        let body = res.text().await?;

        if attempt == 0 {
            if let Some(nonce) = new_nonce {
                if body.contains("use_dpop_nonce") {
                    dpop_nonce = Some(nonce);
                    continue;
                }
            }
        }

        // Try to parse error for better message
        if let Ok(err) = serde_json::from_str::<TokenErrorResponse>(&body) {
            anyhow::bail!("Token exchange failed: {}", err.error);
        }
        anyhow::bail!("Token exchange failed: {}", body);
    }

    anyhow::bail!("Token exchange failed after nonce retry");
}

// --- Token refresh ---

pub async fn refresh_oauth_session(is_bot: bool) -> Result<(OAuthSession, Session)> {
    let oauth = load_oauth_session(is_bot)?;

    let pkcs8_bytes = URL_SAFE_NO_PAD
        .decode(&oauth.dpop_pkcs8)
        .context("Failed to decode DPoP key")?;

    let client = reqwest::Client::new();
    let mut dpop_nonce: Option<String> = None;

    for attempt in 0..2 {
        let dpop_proof = create_dpop_proof(
            &pkcs8_bytes,
            &oauth.dpop_jwk,
            "POST",
            &oauth.token_endpoint,
            dpop_nonce.as_deref(),
            None,
        )?;

        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", oauth.refresh_token.as_deref().unwrap_or("")),
            ("client_id", &oauth.issuer),
        ];

        let site_url = load_site_url()?;
        let client_id_url = format!("{}/client-metadata.json", site_url);

        let form_params = [
            ("grant_type", "refresh_token"),
            (
                "refresh_token",
                oauth.refresh_token.as_deref().unwrap_or(""),
            ),
            ("client_id", &client_id_url),
        ];

        let res = client
            .post(&oauth.token_endpoint)
            .header("DPoP", &dpop_proof)
            .form(&form_params)
            .send()
            .await?;

        let new_nonce = res
            .headers()
            .get("dpop-nonce")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        if res.status().is_success() {
            let token_res: TokenResponse = res.json().await?;
            let sub = token_res.sub.as_deref().unwrap_or(&oauth.did);

            let new_oauth = OAuthSession {
                did: sub.to_string(),
                handle: oauth.handle.clone(),
                access_token: token_res.access_token.clone(),
                refresh_token: token_res.refresh_token.or(oauth.refresh_token),
                pds: oauth.pds.clone(),
                token_endpoint: oauth.token_endpoint.clone(),
                issuer: oauth.issuer.clone(),
                dpop_pkcs8: oauth.dpop_pkcs8.clone(),
                dpop_jwk: DpopJwk {
                    kty: oauth.dpop_jwk.kty.clone(),
                    crv: oauth.dpop_jwk.crv.clone(),
                    x: oauth.dpop_jwk.x.clone(),
                    y: oauth.dpop_jwk.y.clone(),
                },
            };
            save_oauth_session(&new_oauth, is_bot)?;

            let pds_host = oauth
                .pds
                .strip_prefix("https://")
                .unwrap_or(&oauth.pds)
                .trim_end_matches('/');

            let compat = Session {
                did: sub.to_string(),
                handle: oauth.handle.clone(),
                access_jwt: token_res.access_token,
                refresh_jwt: new_oauth.refresh_token.clone().unwrap_or_default(),
                pds: Some(pds_host.to_string()),
            };

            if is_bot {
                token::save_bot_session(&compat)?;
            } else {
                token::save_session(&compat)?;
            }

            return Ok((new_oauth, compat));
        }

        let body = res.text().await?;
        if attempt == 0 {
            if let Some(nonce) = new_nonce {
                if body.contains("use_dpop_nonce") {
                    dpop_nonce = Some(nonce);
                    let _ = params;
                    continue;
                }
            }
        }
        anyhow::bail!("OAuth token refresh failed: {}", body);
    }
    anyhow::bail!("OAuth token refresh failed after nonce retry");
}

/// Create a DPoP proof for an API request with optional nonce
pub fn create_dpop_proof_for_request_with_nonce(
    oauth: &OAuthSession,
    method: &str,
    url: &str,
    nonce: Option<&str>,
) -> Result<String> {
    let pkcs8_bytes = URL_SAFE_NO_PAD
        .decode(&oauth.dpop_pkcs8)
        .context("Failed to decode DPoP key")?;

    // Compute ath (access token hash)
    let ath_hash = ring::digest::digest(&ring::digest::SHA256, oauth.access_token.as_bytes());
    let ath = URL_SAFE_NO_PAD.encode(ath_hash.as_ref());

    create_dpop_proof(&pkcs8_bytes, &oauth.dpop_jwk, method, url, nonce, Some(&ath))
}

// --- Load OAuth session ---

pub fn load_oauth_session(is_bot: bool) -> Result<OAuthSession> {
    let config_dir = dirs::config_dir()
        .context("Could not find config directory")?
        .join(BUNDLE_ID);

    let filename = if is_bot {
        "oauth_bot_session.json"
    } else {
        "oauth_session.json"
    };
    let path = config_dir.join(filename);
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("OAuth session not found: {:?}", path))?;
    let session: OAuthSession = serde_json::from_str(&content)?;
    Ok(session)
}

/// Check if OAuth session exists
pub fn has_oauth_session(is_bot: bool) -> bool {
    let config_dir = match dirs::config_dir() {
        Some(d) => d.join(BUNDLE_ID),
        None => return false,
    };
    let filename = if is_bot {
        "oauth_bot_session.json"
    } else {
        "oauth_session.json"
    };
    config_dir.join(filename).exists()
}

// --- Save ---

fn save_oauth_session(session: &OAuthSession, is_bot: bool) -> Result<()> {
    let config_dir = dirs::config_dir()
        .context("Could not find config directory")?
        .join(BUNDLE_ID);
    std::fs::create_dir_all(&config_dir)?;

    let filename = if is_bot {
        "oauth_bot_session.json"
    } else {
        "oauth_session.json"
    };
    let path = config_dir.join(filename);
    let content = serde_json::to_string_pretty(session)?;
    std::fs::write(&path, content)?;
    println!("OAuth session saved to {:?}", path);
    Ok(())
}

// --- Main entry ---

pub async fn oauth_login(handle: &str, is_bot: bool) -> Result<()> {
    let account_type = if is_bot { "bot" } else { "user" };
    println!("Starting OAuth login for {} ({})...", handle, account_type);

    // 1. Resolve handle → DID → PDS
    println!("Resolving handle...");
    let did = resolve_handle_to_did(handle).await?;
    println!("DID: {}", did);

    let (_, pds_url) = resolve_did_to_pds(&did).await?;
    println!("PDS: {}", pds_url);

    // 2. Fetch OAuth metadata
    println!("Fetching OAuth metadata...");
    let meta = fetch_auth_server_metadata(&pds_url).await?;

    // 3. Generate PKCE
    let (code_verifier, code_challenge) = generate_pkce()?;

    // 4. Generate DPoP key pair
    let dpop_key = generate_dpop_keypair()?;

    // 5. Client metadata (derived from config.json siteUrl)
    let site_url = load_site_url()?;
    let client_id = format!("{}/client-metadata.json", site_url);
    let scope = "atproto transition:generic";

    // Try /oauth/cli first, fallback to /oauth/callback
    let redirect_candidates = [
        format!("{}/oauth/cli", site_url),
        format!("{}/oauth/callback", site_url),
    ];

    let mut redirect_uri = String::new();
    let mut par_res: Option<ParResponse> = None;

    // 6. PAR (try each redirect_uri)
    println!("Sending authorization request...");
    for candidate in &redirect_candidates {
        match pushed_authorization_request(
            &meta.pushed_authorization_request_endpoint,
            &client_id,
            candidate,
            &code_challenge,
            scope,
            &did,
            &dpop_key,
        )
        .await
        {
            Ok(res) => {
                redirect_uri = candidate.clone();
                par_res = Some(res);
                break;
            }
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("Invalid redirect_uri") && candidate != redirect_candidates.last().unwrap() {
                    println!("  {} not accepted, trying fallback...", candidate);
                    // Regenerate DPoP key for retry (nonce may have changed)
                    continue;
                }
                return Err(e);
            }
        }
    }

    let par_res = par_res.context("All redirect_uri candidates rejected by PDS")?;

    // 7. Build authorize URL
    let auth_url = format!(
        "{}?client_id={}&request_uri={}",
        meta.authorization_endpoint,
        percent_encode(&client_id),
        percent_encode(&par_res.request_uri),
    );

    println!("\nOpen this URL in your browser to authorize:\n");
    println!("  {}\n", auth_url);
    println!("After authorizing, paste the code from the browser here.");
    print!("Code: ");
    io::stdout().flush()?;

    let mut code = String::new();
    io::stdin().read_line(&mut code)?;
    let code = code.trim();

    if code.is_empty() {
        anyhow::bail!("No authorization code provided");
    }

    // 8. Exchange code for tokens
    println!("Exchanging code for tokens...");
    let (token_res, _dpop_nonce) = exchange_code(
        &meta.token_endpoint,
        &client_id,
        &redirect_uri,
        code,
        &code_verifier,
        &dpop_key,
        None,
    )
    .await?;

    if token_res.token_type.to_lowercase() != "dpop" {
        println!(
            "Warning: Expected DPoP token type, got '{}'",
            token_res.token_type
        );
    }

    let resolved_did = token_res.sub.as_deref().unwrap_or(&did);

    // 9. Save OAuth session (DPoP keys + tokens)
    let oauth_session = OAuthSession {
        did: resolved_did.to_string(),
        handle: handle.to_string(),
        access_token: token_res.access_token.clone(),
        refresh_token: token_res.refresh_token.clone(),
        pds: pds_url.clone(),
        token_endpoint: meta.token_endpoint.clone(),
        issuer: meta.issuer.clone(),
        dpop_pkcs8: URL_SAFE_NO_PAD.encode(&dpop_key.pkcs8_bytes),
        dpop_jwk: dpop_key.jwk,
    };
    save_oauth_session(&oauth_session, is_bot)?;

    // 10. Save compatible Session (for existing commands)
    let pds_host = pds_url
        .strip_prefix("https://")
        .unwrap_or(&pds_url)
        .trim_end_matches('/');

    let compat_session = Session {
        did: resolved_did.to_string(),
        handle: handle.to_string(),
        access_jwt: token_res.access_token,
        refresh_jwt: token_res.refresh_token.unwrap_or_default(),
        pds: Some(pds_host.to_string()),
    };

    if is_bot {
        token::save_bot_session(&compat_session)?;
        println!("Bot session saved.");
    } else {
        token::save_session(&compat_session)?;
        println!("Session saved.");
    }

    println!(
        "Logged in as {} ({}) via OAuth",
        compat_session.handle, compat_session.did
    );

    Ok(())
}
