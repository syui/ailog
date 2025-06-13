use actix_web::{web, App, HttpResponse, HttpServer, middleware};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use chrono::{DateTime, Utc};

#[derive(Clone)]
struct RateLimiter {
    requests: Arc<Mutex<HashMap<String, Vec<DateTime<Utc>>>>>,
    limit_per_hour: usize,
}

impl RateLimiter {
    fn new(limit: usize) -> Self {
        Self {
            requests: Arc::new(Mutex::new(HashMap::new())),
            limit_per_hour: limit,
        }
    }

    fn check_limit(&self, user_id: &str) -> bool {
        let mut requests = self.requests.lock().unwrap();
        let now = Utc::now();
        let hour_ago = now - chrono::Duration::hours(1);
        
        let user_requests = requests.entry(user_id.to_string()).or_insert(Vec::new());
        user_requests.retain(|&time| time > hour_ago);
        
        if user_requests.len() < self.limit_per_hour {
            user_requests.push(now);
            true
        } else {
            false
        }
    }
}

#[derive(Deserialize)]
struct GenerateRequest {
    model: String,
    prompt: String,
    stream: bool,
    options: Option<serde_json::Value>,
}

async fn proxy_generate(
    req: web::Json<GenerateRequest>,
    data: web::Data<AppState>,
    user_info: web::ReqData<UserInfo>, // ATProto認証から取得
) -> Result<HttpResponse, actix_web::Error> {
    // レート制限チェック
    if !data.rate_limiter.check_limit(&user_info.did) {
        return Ok(HttpResponse::TooManyRequests()
            .json(serde_json::json!({
                "error": "Rate limit exceeded. Please try again later."
            })));
    }
    
    // プロンプトサイズ制限
    if req.prompt.len() > 500 {
        return Ok(HttpResponse::BadRequest()
            .json(serde_json::json!({
                "error": "Prompt too long. Maximum 500 characters."
            })));
    }
    
    // Ollamaへのリクエスト転送
    let client = reqwest::Client::new();
    let response = client
        .post("http://localhost:11434/api/generate")
        .json(&req.into_inner())
        .send()
        .await?;
    
    let body = response.bytes().await?;
    Ok(HttpResponse::Ok()
        .content_type("application/json")
        .body(body))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let rate_limiter = RateLimiter::new(20); // 1時間に20リクエスト
    
    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState {
                rate_limiter: rate_limiter.clone(),
            }))
            .wrap(middleware::Logger::default())
            .route("/api/generate", web::post().to(proxy_generate))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}