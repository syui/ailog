use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

mod analyzer;
mod commands;
mod doc_generator;
mod generator;
mod markdown;
mod shortcode;
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
#[command(disable_version_flag = true)]
struct Cli {
    /// Print version information
    #[arg(short = 'V', long = "version")]
    version: bool,
    
    #[command(subcommand)]
    command: Option<Commands>,
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
        /// Slug for the post (optional, derived from title if not provided)
        #[arg(short, long)]
        slug: Option<String>,
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
        /// Enable Claude proxy mode
        #[arg(long)]
        claude_proxy: bool,
        /// API token for Claude proxy authentication
        #[arg(long)]
        api_token: Option<String>,
        /// Claude Code executable path
        #[arg(long, default_value = "claude")]
        claude_code_path: String,
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
    Init {
        /// Specify PDS server (e.g., syu.is, bsky.social)
        #[arg(long)]
        pds: Option<String>,
        /// Handle/username for authentication
        #[arg(long)]
        handle: Option<String>,
        /// Use password authentication instead of JWT
        #[arg(long)]
        password: bool,
        /// Access JWT token (alternative to password auth)
        #[arg(long)]
        access_jwt: Option<String>,
        /// Refresh JWT token (required with access-jwt)
        #[arg(long)]
        refresh_jwt: Option<String>,
    },
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
        /// Enable AI content generation
        #[arg(long)]
        ai_generate: bool,
    },
    /// Initialize user list for admin account
    Init {
        /// Path to the blog project directory
        project_dir: Option<PathBuf>,
        /// Handles to add to initial user list (comma-separated)
        #[arg(long)]
        handles: Option<String>,
    },
    /// Stop monitoring
    Stop,
    /// Show monitoring status
    Status,
    /// Test API access to comments collection
    Test,
    /// Test user list update functionality
    TestUserUpdate,
    /// Test recent comment detection logic
    TestRecentDetection,
    /// Test complete polling cycle logic
    TestPollingCycle,
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
    
    // Handle version flag
    if cli.version {
        println!("{}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    
    // Require subcommand if no version flag
    let command = cli.command.ok_or_else(|| {
        anyhow::anyhow!("No subcommand provided. Use --help for usage information.")
    })?;

    match command {
        Commands::Init { path } => {
            commands::init::execute(path).await?;
        }
        Commands::Build { path } => {
            commands::build::execute(path).await?;
        }
        Commands::New { title, slug, format, path } => {
            std::env::set_current_dir(path)?;
            commands::new::execute(title, slug, format).await?;
        }
        Commands::Serve { port, path } => {
            std::env::set_current_dir(path)?;
            commands::serve::execute(port).await?;
        }
        Commands::Clean { path } => {
            std::env::set_current_dir(path)?;
            commands::clean::execute().await?;
        }
        Commands::Mcp { port, path, claude_proxy, api_token, claude_code_path } => {
            use crate::mcp::McpServer;
            let mut server = McpServer::new(path);
            
            if claude_proxy {
                let token = api_token
                    .or_else(|| std::env::var("CLAUDE_PROXY_API_TOKEN").ok())
                    .ok_or_else(|| {
                        anyhow::anyhow!("API token is required when --claude-proxy is enabled. Set CLAUDE_PROXY_API_TOKEN environment variable or use --api-token")
                    })?;
                server = server.with_claude_proxy(token, Some(claude_code_path.clone()));
                println!("Claude proxy mode enabled - using Claude Code executable: {}", claude_code_path);
            }
            
            server.serve(port).await?;
        }
        Commands::Doc(doc_cmd) => {
            doc_cmd.execute(std::env::current_dir()?).await?;
        }
        Commands::Auth { command } => {
            match command {
                AuthCommands::Init { pds, handle, password, access_jwt, refresh_jwt } => {
                    commands::auth::init_with_options(pds, handle, password, access_jwt, refresh_jwt).await?;
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
                StreamCommands::Start { project_dir, daemon, ai_generate } => {
                    commands::stream::start(project_dir, daemon, ai_generate).await?;
                }
                StreamCommands::Init { project_dir, handles } => {
                    commands::stream::init_user_list(project_dir, handles).await?;
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
                StreamCommands::TestUserUpdate => {
                    commands::stream::test_user_update().await?;
                }
                StreamCommands::TestRecentDetection => {
                    commands::stream::test_recent_detection().await?;
                }
                StreamCommands::TestPollingCycle => {
                    commands::stream::test_polling_cycle().await?;
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