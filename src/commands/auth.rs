use anyhow::Result;

use super::token::{self, Session};
use crate::lexicons::com_atproto_server;
use crate::types::{CreateSessionRequest, CreateSessionResponse};
use crate::xrpc::XrpcClient;

/// Login to ATProto PDS
pub async fn login(handle: &str, password: &str, pds: &str, is_bot: bool) -> Result<()> {
    let client = XrpcClient::new(pds);

    let req = CreateSessionRequest {
        identifier: handle.to_string(),
        password: password.to_string(),
    };

    let account_type = if is_bot { "bot" } else { "user" };
    println!("Logging in to {} as {} ({})...", pds, handle, account_type);

    let session_res: CreateSessionResponse =
        client.call_unauth(&com_atproto_server::CREATE_SESSION, &req).await?;

    let session = Session {
        did: session_res.did,
        handle: session_res.handle,
        access_jwt: session_res.access_jwt,
        refresh_jwt: session_res.refresh_jwt,
        pds: Some(pds.to_string()),
    };

    if is_bot {
        token::save_bot_session(&session)?;
    } else {
        token::save_session(&session)?;
    }
    println!("Logged in as {} ({})", session.handle, session.did);

    Ok(())
}

/// Refresh a session (shared logic for user and bot)
async fn do_refresh(session: &Session, pds: &str) -> Result<Session> {
    let client = XrpcClient::new(pds);

    let new_session: CreateSessionResponse = client
        .call_bearer(&com_atproto_server::REFRESH_SESSION, &session.refresh_jwt)
        .await?;

    Ok(Session {
        did: new_session.did,
        handle: new_session.handle,
        access_jwt: new_session.access_jwt,
        refresh_jwt: new_session.refresh_jwt,
        pds: Some(pds.to_string()),
    })
}

/// Refresh access token
pub async fn refresh_session() -> Result<Session> {
    let session = token::load_session()?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");

    let new_session = do_refresh(&session, pds).await?;
    token::save_session(&new_session)?;

    Ok(new_session)
}

/// Refresh bot access token
pub async fn refresh_bot_session() -> Result<Session> {
    let session = token::load_bot_session()?;
    let pds = session.pds.as_deref().unwrap_or("bsky.social");

    let new_session = do_refresh(&session, pds).await?;
    token::save_bot_session(&new_session)?;

    Ok(new_session)
}
