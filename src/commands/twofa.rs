use std::io::{self, Write};

use anyhow::{Context, Result};

use super::token;
use crate::types::{
    GetSessionResponse, RequestEmailUpdateResponse, UpdateEmailRequest,
};

/// Read a line from stdin with a prompt
fn prompt_input(msg: &str) -> Result<String> {
    eprint!("{}", msg);
    io::stderr().flush()?;
    let mut buf = String::new();
    io::stdin().read_line(&mut buf)?;
    Ok(buf.trim().to_string())
}

/// Build XRPC URL
fn xrpc_url(pds: &str, nsid: &str) -> String {
    format!("https://{}/xrpc/{}", pds, nsid)
}

/// Bearer GET request (bypasses OAuth/DPoP entirely)
async fn bearer_get<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    pds: &str,
    nsid: &str,
    token: &str,
) -> Result<T> {
    let url = xrpc_url(pds, nsid);
    let res = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .context("XRPC GET failed")?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("XRPC error ({}): {}", status.as_u16(), body);
    }
    res.json::<T>().await.context("Failed to parse response")
}

/// Bearer POST request without body
async fn bearer_post_empty<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    pds: &str,
    nsid: &str,
    token: &str,
) -> Result<T> {
    let url = xrpc_url(pds, nsid);
    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .context("XRPC POST failed")?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("XRPC error ({}): {}", status.as_u16(), body);
    }
    res.json::<T>().await.context("Failed to parse response")
}

/// Bearer POST request with JSON body
async fn bearer_post<B: serde::Serialize>(
    client: &reqwest::Client,
    pds: &str,
    nsid: &str,
    token: &str,
    body: &B,
) -> Result<String> {
    let url = xrpc_url(pds, nsid);
    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .json(body)
        .send()
        .await
        .context("XRPC POST failed")?;
    let status = res.status();
    let response_body = res.text().await.unwrap_or_default();
    if !status.is_success() {
        anyhow::bail!("XRPC error ({}): {}", status.as_u16(), response_body);
    }
    Ok(response_body)
}

/// Refresh legacy session via Bearer token (no DPoP)
async fn refresh_legacy(
    client: &reqwest::Client,
    pds: &str,
    refresh_jwt: &str,
) -> Result<token::Session> {
    let url = xrpc_url(pds, "com.atproto.server.refreshSession");
    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", refresh_jwt))
        .send()
        .await
        .context("Refresh session failed")?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("Refresh failed ({}): {}", status.as_u16(), body);
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RefreshResponse {
        did: String,
        handle: String,
        access_jwt: String,
        refresh_jwt: String,
    }

    let r: RefreshResponse = res.json().await.context("Failed to parse refresh response")?;
    Ok(token::Session {
        did: r.did,
        handle: r.handle,
        access_jwt: r.access_jwt,
        refresh_jwt: r.refresh_jwt,
        pds: Some(pds.to_string()),
    })
}

/// Load legacy session, refresh it, and return (session, http client, pds).
/// All requests use plain Bearer auth, completely bypassing OAuth/DPoP.
async fn get_legacy_session(is_bot: bool) -> Result<(token::Session, reqwest::Client, String)> {
    let session = if is_bot {
        token::load_bot_session()?
    } else {
        token::load_session()?
    };
    let pds = session.pds.as_deref().unwrap_or("bsky.social").to_string();
    let client = reqwest::Client::new();

    let refreshed = refresh_legacy(&client, &pds, &session.refresh_jwt).await?;
    if is_bot {
        token::save_bot_session(&refreshed)?;
    } else {
        token::save_session(&refreshed)?;
    }

    Ok((refreshed, client, pds))
}

/// Resolve email: from --email flag, API response, or interactive prompt
fn resolve_email(api_email: Option<String>, flag_email: Option<&str>) -> Result<String> {
    if let Some(e) = flag_email {
        return Ok(e.to_string());
    }
    if let Some(e) = api_email {
        return Ok(e);
    }
    prompt_input("Email not available from session. Enter your email: ")
}

/// Show current 2FA status
pub async fn status(is_bot: bool) -> Result<()> {
    let (session, client, pds) = get_legacy_session(is_bot).await?;

    let info: GetSessionResponse = bearer_get(
        &client, &pds, "com.atproto.server.getSession", &session.access_jwt,
    ).await?;

    println!("Handle:   {}", info.handle);
    println!("Email:    {}", info.email.as_deref().unwrap_or("(not available)"));
    println!("2FA:      {}", if info.email_auth_factor { "enabled" } else { "disabled" });

    Ok(())
}

/// Enable email 2FA
pub async fn enable(is_bot: bool, email_flag: Option<&str>) -> Result<()> {
    let (session, client, pds) = get_legacy_session(is_bot).await?;

    let info: GetSessionResponse = bearer_get(
        &client, &pds, "com.atproto.server.getSession", &session.access_jwt,
    ).await?;

    if info.email_auth_factor {
        println!("2FA is already enabled.");
        return Ok(());
    }

    let email = resolve_email(info.email, email_flag)?;

    println!("Requesting confirmation code to {}...", email);
    let resp: RequestEmailUpdateResponse = bearer_post_empty(
        &client, &pds, "com.atproto.server.requestEmailUpdate", &session.access_jwt,
    ).await?;

    if !resp.token_required {
        let req = UpdateEmailRequest {
            email,
            token: None,
            email_auth_factor: Some(true),
        };
        let res_body = bearer_post(
            &client, &pds, "com.atproto.server.updateEmail", &session.access_jwt, &req,
        ).await?;
        if !res_body.is_empty() {
            eprintln!("PDS response: {}", res_body);
        }
    } else {
        let token = prompt_input("Enter confirmation code from email: ")?;
        if token.is_empty() {
            anyhow::bail!("No code entered, aborting.");
        }

        let req = UpdateEmailRequest {
            email,
            token: Some(token),
            email_auth_factor: Some(true),
        };

        let res_body = bearer_post(
            &client, &pds, "com.atproto.server.updateEmail", &session.access_jwt, &req,
        ).await?;
        if !res_body.is_empty() {
            eprintln!("PDS response: {}", res_body);
        }
    }

    // Verify
    let check: GetSessionResponse = bearer_get(
        &client, &pds, "com.atproto.server.getSession", &session.access_jwt,
    ).await?;

    if check.email_auth_factor {
        println!("2FA enabled.");
    } else {
        println!("Warning: PDS accepted the request but 2FA is still disabled.");
        println!("This PDS may not support email 2FA via updateEmail.");
    }

    Ok(())
}

/// Disable email 2FA
pub async fn disable(is_bot: bool, email_flag: Option<&str>) -> Result<()> {
    let (session, client, pds) = get_legacy_session(is_bot).await?;

    let info: GetSessionResponse = bearer_get(
        &client, &pds, "com.atproto.server.getSession", &session.access_jwt,
    ).await?;

    if !info.email_auth_factor {
        println!("2FA is already disabled.");
        return Ok(());
    }

    let email = resolve_email(info.email, email_flag)?;

    println!("Requesting confirmation code to {}...", email);
    let _resp: RequestEmailUpdateResponse = bearer_post_empty(
        &client, &pds, "com.atproto.server.requestEmailUpdate", &session.access_jwt,
    ).await?;

    let token = prompt_input("Enter confirmation code from email: ")?;
    if token.is_empty() {
        anyhow::bail!("No code entered, aborting.");
    }

    let req = UpdateEmailRequest {
        email,
        token: Some(token),
        email_auth_factor: Some(false),
    };

    let res_body = bearer_post(
        &client, &pds, "com.atproto.server.updateEmail", &session.access_jwt, &req,
    ).await?;
    if !res_body.is_empty() {
        eprintln!("PDS response: {}", res_body);
    }

    // Verify
    let check: GetSessionResponse = bearer_get(
        &client, &pds, "com.atproto.server.getSession", &session.access_jwt,
    ).await?;

    if !check.email_auth_factor {
        println!("2FA disabled.");
    } else {
        println!("Warning: PDS accepted the request but 2FA is still enabled.");
    }

    Ok(())
}
