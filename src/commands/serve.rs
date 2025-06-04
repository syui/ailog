use anyhow::Result;
use colored::Colorize;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

pub async fn execute(port: u16) -> Result<()> {
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
    let mut buffer = [0; 1024];
    stream.read(&mut buffer).await?;

    let request = String::from_utf8_lossy(&buffer[..]);
    let path = parse_request_path(&request);

    let (status, content_type, content) = match serve_file(&path).await {
        Ok((ct, data)) => ("200 OK", ct, data),
        Err(_) => ("404 NOT FOUND", "text/html", b"<h1>404 - Not Found</h1>".to_vec()),
    };

    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\n\r\n",
        status,
        content_type,
        content.len()
    );

    stream.write_all(response.as_bytes()).await?;
    stream.write_all(&content).await?;
    stream.flush().await?;

    Ok(())
}

fn parse_request_path(request: &str) -> String {
    request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/")
        .to_string()
}

async fn serve_file(path: &str) -> Result<(&'static str, Vec<u8>)> {
    let file_path = if path == "/" {
        PathBuf::from("public/index.html")
    } else {
        PathBuf::from("public").join(path.trim_start_matches('/'))
    };

    let content_type = match file_path.extension().and_then(|ext| ext.to_str()) {
        Some("html") => "text/html",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        _ => "text/plain",
    };

    let content = tokio::fs::read(file_path).await?;
    Ok((content_type, content))
}