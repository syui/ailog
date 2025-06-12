use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

mod analyzer;
mod commands;
mod doc_generator;
mod generator;
mod markdown;
mod template;
mod oauth;
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
        /// Path to the blog directory
        #[arg(default_value = ".")]
        path: PathBuf,
    },
    /// Serve the blog locally
    Serve {
        /// Port to serve on
        #[arg(short, long, default_value = "8080")]
        port: u16,
        /// Path to the blog directory
        #[arg(default_value = ".")]
        path: PathBuf,
    },
    /// Clean build artifacts
    Clean {
        /// Path to the blog directory
        #[arg(default_value = ".")]
        path: PathBuf,
    },
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
    /// ATProto authentication
    Auth {
        #[command(subcommand)]
        command: AuthCommands,
    },
    /// ATProto stream monitoring
    Stream {
        #[command(subcommand)]
        command: StreamCommands,
    },
    /// OAuth app management
    Oauth {
        #[command(subcommand)]
        command: OauthCommands,
    },
}

#[derive(Subcommand)]
enum AuthCommands {
    /// Initialize OAuth authentication
    Init,
    /// Show current authentication status
    Status,
    /// Logout and clear credentials
    Logout,
}

#[derive(Subcommand)]
enum StreamCommands {
    /// Start monitoring ATProto streams
    Start {
        /// Path to the blog project directory
        project_dir: Option<PathBuf>,
        /// Run as daemon
        #[arg(short, long)]
        daemon: bool,
    },
    /// Stop monitoring
    Stop,
    /// Show monitoring status
    Status,
    /// Test API access to comments collection
    Test,
}

#[derive(Subcommand)]
enum OauthCommands {
    /// Build OAuth app
    Build {
        /// Path to the blog project directory
        project_dir: PathBuf,
    },
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
        Commands::New { title, format, path } => {
            std::env::set_current_dir(path)?;
            commands::new::execute(title, format).await?;
        }
        Commands::Serve { port, path } => {
            std::env::set_current_dir(path)?;
            commands::serve::execute(port).await?;
        }
        Commands::Clean { path } => {
            std::env::set_current_dir(path)?;
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
        Commands::Auth { command } => {
            match command {
                AuthCommands::Init => {
                    commands::auth::init().await?;
                }
                AuthCommands::Status => {
                    commands::auth::status().await?;
                }
                AuthCommands::Logout => {
                    commands::auth::logout().await?;
                }
            }
        }
        Commands::Stream { command } => {
            match command {
                StreamCommands::Start { project_dir, daemon } => {
                    commands::stream::start(project_dir, daemon).await?;
                }
                StreamCommands::Stop => {
                    commands::stream::stop().await?;
                }
                StreamCommands::Status => {
                    commands::stream::status().await?;
                }
                StreamCommands::Test => {
                    commands::stream::test_api().await?;
                }
            }
        }
        Commands::Oauth { command } => {
            match command {
                OauthCommands::Build { project_dir } => {
                    commands::oauth::build(project_dir).await?;
                }
            }
        }
    }

    Ok(())
}