use anyhow::Result;
use colored::Colorize;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

pub async fn execute(port: u16) -> Result<()> {
    // Check if public directory exists
    if !std::path::Path::new("public").exists() {
        println!("{}", "No public directory found. Running build first...".yellow());
        crate::commands::build::execute(std::path::PathBuf::from(".")).await?;
    }

    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await?;
    
    println!("{}", "Starting development server...".green());
    println!("Serving at: {}", format!("http://{}", addr).blue().underline());
    println!("Press Ctrl+C to stop\n");

    loop {
        let (stream, _) = listener.accept().await?;
        tokio::spawn(handle_connection(stream));
    }
}

async fn handle_connection(mut stream: TcpStream) -> Result<()> {
    // Read request with timeout and proper buffering
    let mut buffer = [0; 4096];
    let bytes_read = match tokio::time::timeout(
        tokio::time::Duration::from_secs(5),
        stream.read(&mut buffer)
    ).await {
        Ok(Ok(n)) => n,
        Ok(Err(_)) => return Ok(()),
        Err(_) => {
            eprintln!("Request timeout");
            return Ok(());
        }
    };

    if bytes_read == 0 {
        return Ok(());
    }

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let (method, path) = parse_request(&request);

    // Skip empty requests
    if method.is_empty() || path.is_empty() {
        return Ok(());
    }

    // Log request for debugging
    println!("{} {} {} ({})", 
        "REQUEST".green(),
        method.cyan(), 
        path.yellow(),
        std::env::current_dir().unwrap().display()
    );

    let (status, content_type, content, cache_control) = if method == "POST" && path == "/api/ask" {
        // Handle Ask AI API request
        let (s, ct, c) = handle_ask_api(&request).await;
        (s, ct, c, "no-cache")
    } else if method == "OPTIONS" {
        // Handle CORS preflight
        ("200 OK", "text/plain", Vec::new(), "no-cache")
    } else if path.starts_with("/oauth/callback") {
        // Handle OAuth callback - serve the callback HTML page
        match serve_oauth_callback().await {
            Ok((ct, data, cc)) => ("200 OK", ct, data, cc),
            Err(e) => {
                eprintln!("Error serving OAuth callback: {}", e);
                ("500 INTERNAL SERVER ERROR", "text/html",
                 "<h1>500 - Server Error</h1><p>OAuth callback error</p>".as_bytes().to_vec(),
                 "no-cache")
            }
        }
    } else if path.starts_with("/.well-known/") || path.contains("devtools") {
        // Ignore browser dev tools and well-known requests
        ("404 NOT FOUND", "text/plain", "Not Found".as_bytes().to_vec(), "no-cache")
    } else {
        // Handle static file serving
        match serve_file(&path).await {
            Ok((ct, data, cc)) => ("200 OK", ct, data, cc),
            Err(e) => {
                // Only log actual file serving errors, not dev tool requests
                if !path.contains("devtools") && !path.starts_with("/.well-known/") {
                    eprintln!("Error serving {}: {}", path, e);
                }
                ("404 NOT FOUND", "text/html", 
                 format!("<h1>404 - Not Found</h1><p>Path: {}</p>", path).into_bytes(),
                 "no-cache")
            }
        }
    };

    // Build HTTP response with proper headers
    let response_header = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n",
        status, content_type, content.len(), cache_control
    );

    // Send response
    if let Err(e) = stream.write_all(response_header.as_bytes()).await {
        eprintln!("Error writing headers: {}", e);
        return Ok(());
    }
    
    if let Err(e) = stream.write_all(&content).await {
        eprintln!("Error writing content: {}", e);
        return Ok(());
    }
    
    if let Err(e) = stream.flush().await {
        eprintln!("Error flushing stream: {}", e);
    }

    Ok(())
}

fn parse_request(request: &str) -> (String, String) {
    let first_line = request.lines().next().unwrap_or("").trim();
    if first_line.is_empty() {
        return (String::new(), String::new());
    }
    
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return (String::new(), String::new());
    }
    
    let method = parts[0].to_string();
    let path = parts[1].to_string();
    
    (method, path)
}

async fn handle_ask_api(request: &str) -> (&'static str, &'static str, Vec<u8>) {
    // Extract JSON body from request
    let body_start = request.find("\r\n\r\n").map(|i| i + 4).unwrap_or(0);
    let body = &request[body_start..];
    
    // Parse question from JSON
    let question = extract_question_from_json(body).unwrap_or_else(|| "Hello".to_string());
    
    // Call Ollama API
    match call_ollama_api(&question).await {
        Ok(answer) => {
            let response_json = format!(r#"{{"answer": "{}"}}"#, answer.replace('"', r#"\""#));
            ("200 OK", "application/json", response_json.into_bytes())
        }
        Err(_) => {
            let error_json = r#"{"error": "Failed to get AI response"}"#;
            ("500 INTERNAL SERVER ERROR", "application/json", error_json.as_bytes().to_vec())
        }
    }
}

fn extract_question_from_json(json_str: &str) -> Option<String> {
    // Simple JSON parsing for {"question": "..."}
    if let Some(start) = json_str.find(r#""question""#) {
        if let Some(colon_pos) = json_str[start..].find(':') {
            let after_colon = &json_str[start + colon_pos + 1..];
            if let Some(quote_start) = after_colon.find('"') {
                let after_quote = &after_colon[quote_start + 1..];
                if let Some(quote_end) = after_quote.find('"') {
                    return Some(after_quote[..quote_end].to_string());
                }
            }
        }
    }
    None
}

async fn call_ollama_api(question: &str) -> Result<String> {
    // Call Ollama API (assuming it's running on localhost:11434)
    use tokio::process::Command;
    
    let output = Command::new("curl")
        .args(&[
            "-X", "POST",
            "http://localhost:11434/api/generate",
            "-H", "Content-Type: application/json",
            "-d", &format!(r#"{{"model": "llama2", "prompt": "{}", "stream": false}}"#, question.replace('"', r#"\""#))
        ])
        .output()
        .await?;
    
    if output.status.success() {
        let response = String::from_utf8_lossy(&output.stdout);
        // Parse Ollama response JSON
        if let Some(answer) = extract_response_from_ollama(&response) {
            Ok(answer)
        } else {
            Ok("I'm sorry, I couldn't process your question right now.".to_string())
        }
    } else {
        Err(anyhow::anyhow!("Ollama API call failed"))
    }
}

fn extract_response_from_ollama(json_str: &str) -> Option<String> {
    // Simple JSON parsing for {"response": "..."}
    if let Some(start) = json_str.find(r#""response""#) {
        if let Some(colon_pos) = json_str[start..].find(':') {
            let after_colon = &json_str[start + colon_pos + 1..];
            if let Some(quote_start) = after_colon.find('"') {
                let after_quote = &after_colon[quote_start + 1..];
                if let Some(quote_end) = after_quote.find('"') {
                    return Some(after_quote[..quote_end].to_string());
                }
            }
        }
    }
    None
}

async fn serve_oauth_callback() -> Result<(&'static str, Vec<u8>, &'static str)> {
    // Serve OAuth callback HTML from static directory
    let file_path = PathBuf::from("static/oauth/callback.html");
    
    println!("Serving OAuth callback: {}", file_path.display());
    
    // If static file doesn't exist, create a default callback
    if !file_path.exists() {
        let default_callback = r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>OAuth Callback - ai.log</title>
    <script>
    console.log('OAuth callback page loaded');
    
    // Get all URL parameters and hash
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    
    console.log('URL params:', Object.fromEntries(urlParams));
    console.log('Hash params:', Object.fromEntries(hashParams));
    
    // Combine parameters
    const allParams = new URLSearchParams();
    urlParams.forEach((value, key) => allParams.set(key, value));
    hashParams.forEach((value, key) => allParams.set(key, value));
    
    // Check for OAuth response
    const code = allParams.get('code');
    const state = allParams.get('state');
    const iss = allParams.get('iss');
    const error = allParams.get('error');
    
    if (error) {
        console.error('OAuth error:', error);
        alert('OAuth authentication failed: ' + error);
        window.close();
    } else if (code && state) {
        console.log('OAuth success, redirecting with parameters');
        
        // Store OAuth data temporarily
        const oauthData = {
            code: code,
            state: state,
            iss: iss,
            timestamp: Date.now()
        };
        
        localStorage.setItem('oauth_callback_data', JSON.stringify(oauthData));
        
        // For both popup and direct navigation, redirect to main page with hash parameters
        // This ensures React app can properly handle the OAuth callback
        const redirectUrl = new URL(window.location.origin);
        
        // Use hash parameters to avoid server-side processing
        redirectUrl.hash = `#code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}` + 
                          (iss ? `&iss=${encodeURIComponent(iss)}` : '');
        
        console.log('Redirecting to:', redirectUrl.toString());
        
        if (window.opener) {
            // Popup window - notify parent and close
            try {
                window.opener.postMessage({
                    type: 'oauth_callback',
                    data: oauthData,
                    redirectUrl: redirectUrl.toString()
                }, '*');
                console.log('Notified parent window');
                
                // Give parent time to process, then close
                setTimeout(() => window.close(), 500);
            } catch (e) {
                console.error('Failed to notify parent:', e);
                // Fallback - redirect parent window
                window.opener.location.href = redirectUrl.toString();
                window.close();
            }
        } else {
            // Direct navigation - redirect to main page with hash parameters
            window.location.href = redirectUrl.toString();
        }
    } else {
        console.error('Invalid OAuth callback - missing code or state');
        alert('Invalid OAuth callback parameters');
        window.close();
    }
    </script>
</head>
<body>
    <div style="font-family: system-ui; text-align: center; padding: 50px;">
        <h2>🔄 Processing OAuth Authentication...</h2>
        <p>Please wait while we complete your authentication.</p>
        <p><small>This window will close automatically.</small></p>
    </div>
</body>
</html>"#;
        return Ok(("text/html; charset=utf-8", default_callback.as_bytes().to_vec(), "no-cache"));
    }
    
    let content = tokio::fs::read(&file_path).await
        .map_err(|e| anyhow::anyhow!("Failed to read OAuth callback file: {}", e))?;
    
    Ok(("text/html; charset=utf-8", content, "no-cache"))
}

async fn serve_file(path: &str) -> Result<(&'static str, Vec<u8>, &'static str)> {
    // Remove query parameters from path
    let clean_path = path.split('?').next().unwrap_or(path);
    
    let file_path = if clean_path == "/" {
        PathBuf::from("public/index.html")
    } else {
        PathBuf::from("public").join(clean_path.trim_start_matches('/'))
    };

    println!("Serving file: {}", file_path.display());

    // Check if file exists and get metadata
    let metadata = tokio::fs::metadata(&file_path).await?;
    if !metadata.is_file() {
        return Err(anyhow::anyhow!("Not a file: {}", file_path.display()));
    }

    let (content_type, cache_control) = match file_path.extension().and_then(|ext| ext.to_str()) {
        Some("html") => ("text/html; charset=utf-8", "no-cache"),
        Some("css") => ("text/css; charset=utf-8", "public, max-age=3600"),
        Some("js") => ("application/javascript; charset=utf-8", "public, max-age=3600"),
        Some("json") => ("application/json; charset=utf-8", "no-cache"),
        Some("md") => ("text/markdown; charset=utf-8", "no-cache"),
        Some("png") => ("image/png", "public, max-age=86400"),
        Some("jpg") | Some("jpeg") => ("image/jpeg", "public, max-age=86400"),
        Some("gif") => ("image/gif", "public, max-age=86400"),
        Some("svg") => ("image/svg+xml", "public, max-age=3600"),
        Some("ico") => ("image/x-icon", "public, max-age=86400"),
        Some("woff") | Some("woff2") => ("font/woff2", "public, max-age=86400"),
        Some("ttf") => ("font/ttf", "public, max-age=86400"),
        _ => ("text/plain; charset=utf-8", "no-cache"),
    };

    let content = tokio::fs::read(&file_path).await
        .map_err(|e| anyhow::anyhow!("Failed to read file {}: {}", file_path.display(), e))?;
    
    Ok((content_type, content, cache_control))
}