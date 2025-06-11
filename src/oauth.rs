use serde::{Deserialize, Serialize};
use tower_sessions::Session;
use axum::{
    extract::Query,
    response::Html,
    Json,
};
use jsonwebtoken::{encode, decode, Header, Algorithm, Validation, EncodingKey, DecodingKey};
use anyhow::Result;

#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthData {
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub access_jwt: Option<String>,
    pub refresh_jwt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthCallback {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
    pub iss: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // DID
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub exp: usize,
    pub iat: usize,
}

const _JWT_SECRET: &[u8] = b"ailog-oauth-secret-key-2025";

#[allow(dead_code)]
pub fn create_jwt(oauth_data: &OAuthData) -> Result<String> {
    let now = chrono::Utc::now().timestamp() as usize;
    let claims = Claims {
        sub: oauth_data.did.clone(),
        handle: oauth_data.handle.clone(),
        display_name: oauth_data.display_name.clone(),
        avatar: oauth_data.avatar.clone(),
        exp: now + 24 * 60 * 60, // 24 hours
        iat: now,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(_JWT_SECRET),
    )?;

    Ok(token)
}

#[allow(dead_code)]
pub fn verify_jwt(token: &str) -> Result<Claims> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(_JWT_SECRET),
        &Validation::new(Algorithm::HS256),
    )?;

    Ok(token_data.claims)
}

#[allow(dead_code)]
pub async fn oauth_callback_handler(
    Query(params): Query<OAuthCallback>,
    session: Session,
) -> Result<Html<String>, String> {
    println!("🔧 OAuth callback received: {:?}", params);

    if let Some(error) = params.error {
        let error_html = format!(
            r#"
            <!DOCTYPE html>
            <html>
            <head>
                <title>OAuth Error</title>
                <style>
                    body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 50px; }}
                    .error {{ background: #f8d7da; color: #721c24; padding: 20px; border-radius: 8px; }}
                </style>
            </head>
            <body>
                <div class="error">
                    <h2>❌ Authentication Failed</h2>
                    <p><strong>Error:</strong> {}</p>
                    {}
                    <button onclick="window.close()">Close Window</button>
                </div>
            </body>
            </html>
            "#,
            error,
            params.error_description.map(|d| format!("<p><strong>Description:</strong> {}</p>", d)).unwrap_or_default()
        );
        return Ok(Html(error_html));
    }

    if let Some(code) = params.code {
        // In a real implementation, you would exchange the code for tokens here
        // For now, we'll create a mock session
        let oauth_data = OAuthData {
            did: format!("did:plc:example_{}", &code[..8]),
            handle: "user.bsky.social".to_string(),
            display_name: Some("OAuth User".to_string()),
            avatar: Some("https://via.placeholder.com/40x40/1185fe/ffffff?text=U".to_string()),
            access_jwt: None,
            refresh_jwt: None,
        };

        // Create JWT
        let jwt_token = create_jwt(&oauth_data).map_err(|e| e.to_string())?;

        // Store in session
        session.insert("oauth_data", &oauth_data).await.map_err(|e| e.to_string())?;
        session.insert("jwt_token", &jwt_token).await.map_err(|e| e.to_string())?;

        println!("✅ OAuth session created for: {}", oauth_data.handle);

        let success_html = format!(
            r#"
            <!DOCTYPE html>
            <html>
            <head>
                <title>OAuth Success</title>
                <style>
                    body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 50px; }}
                    .success {{ background: #d1edff; color: #0c5460; padding: 20px; border-radius: 8px; }}
                </style>
            </head>
            <body>
                <div class="success">
                    <h2>✅ Authentication Successful</h2>
                    <p><strong>Handle:</strong> @{}</p>
                    <p><strong>DID:</strong> {}</p>
                    <p>You can now close this window.</p>
                </div>
                <script>
                    // Send success message to parent window
                    if (window.opener && !window.opener.closed) {{
                        window.opener.postMessage({{
                            type: 'oauth_success',
                            session: {{
                                authenticated: true,
                                did: '{}',
                                handle: '{}',
                                displayName: '{}',
                                avatar: '{}',
                                jwt: '{}'
                            }}
                        }}, window.location.origin);
                        
                        setTimeout(() => window.close(), 2000);
                    }}
                </script>
            </body>
            </html>
            "#,
            oauth_data.handle,
            oauth_data.did,
            oauth_data.did,
            oauth_data.handle,
            oauth_data.display_name.as_deref().unwrap_or("User"),
            oauth_data.avatar.as_deref().unwrap_or(""),
            jwt_token
        );

        return Ok(Html(success_html));
    }

    Err("No authorization code received".to_string())
}

#[allow(dead_code)]
pub async fn oauth_session_handler(session: Session) -> Json<serde_json::Value> {
    if let Ok(Some(oauth_data)) = session.get::<OAuthData>("oauth_data").await {
        if let Ok(Some(jwt_token)) = session.get::<String>("jwt_token").await {
            return Json(serde_json::json!({
                "authenticated": true,
                "user": oauth_data,
                "jwt": jwt_token
            }));
        }
    }

    Json(serde_json::json!({
        "authenticated": false
    }))
}

#[allow(dead_code)]
pub async fn oauth_logout_handler(session: Session) -> Json<serde_json::Value> {
    let _ = session.remove::<OAuthData>("oauth_data").await;
    let _ = session.remove::<String>("jwt_token").await;

    Json(serde_json::json!({
        "success": true,
        "message": "Logged out successfully"
    }))
}