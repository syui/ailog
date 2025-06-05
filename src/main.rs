use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

mod analyzer;
mod commands;
mod doc_generator;
mod generator;
mod markdown;
mod template;
mod translator;
mod config;
mod ai;
mod atproto;
mod mcp;

#[derive(Parser)]
#[command(name = "ailog")]
#[command(about = "A static blog generator with AI features")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize a new blog
    Init {
        /// Path to create the blog
        #[arg(default_value = ".")]
        path: PathBuf,
    },
    /// Build the blog
    Build {
        /// Path to the blog directory
        #[arg(default_value = ".")]
        path: PathBuf,
    },
    /// Create a new post
    New {
        /// Title of the post
        title: String,
        /// Post format
        #[arg(short, long, default_value = "md")]
        format: String,
    },
    /// Serve the blog locally
    Serve {
        /// Port to serve on
        #[arg(short, long, default_value = "8080")]
        port: u16,
    },
    /// Clean build artifacts
    Clean,
    /// Start MCP server for ai.gpt integration
    Mcp {
        /// Port to serve MCP on
        #[arg(short, long, default_value = "8002")]
        port: u16,
        /// Path to the blog directory
        #[arg(default_value = ".")]
        path: PathBuf,
    },
    /// Generate documentation from code
    Doc(commands::doc::DocCommand),
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Init { path } => {
            commands::init::execute(path).await?;
        }
        Commands::Build { path } => {
            commands::build::execute(path).await?;
        }
        Commands::New { title, format } => {
            commands::new::execute(title, format).await?;
        }
        Commands::Serve { port } => {
            commands::serve::execute(port).await?;
        }
        Commands::Clean => {
            commands::clean::execute().await?;
        }
        Commands::Mcp { port, path } => {
            use crate::mcp::McpServer;
            let server = McpServer::new(path);
            server.serve(port).await?;
        }
        Commands::Doc(doc_cmd) => {
            doc_cmd.execute(std::env::current_dir()?).await?;
        }
    }

    Ok(())
}