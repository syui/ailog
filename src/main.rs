mod commands;
mod error;
mod lexicons;
mod lms;
mod mcp;
mod tid;
mod types;
mod xrpc;

use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "ailog")]
#[command(about = "ATProto blog CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Login to ATProto PDS
    #[command(alias = "l")]
    Login {
        /// Handle (e.g., user.bsky.social)
        handle: String,
        /// Password
        #[arg(short, long)]
        password: String,
        /// PDS server
        #[arg(short, long, default_value = "bsky.social")]
        server: String,
        /// Login as bot (saves to bot.json)
        #[arg(long)]
        bot: bool,
    },

    /// Update lexicon schema
    Lexicon {
        /// Lexicon JSON file
        file: String,
    },

    /// Post a record
    #[command(alias = "p")]
    Post {
        /// Record JSON file
        file: String,
        /// Collection (e.g., ai.syui.log.post)
        #[arg(short, long)]
        collection: String,
        /// Record key (auto-generated if not provided)
        #[arg(short, long)]
        rkey: Option<String>,
    },

    /// Get records from collection
    #[command(alias = "g")]
    Get {
        /// Collection (e.g., ai.syui.log.post)
        #[arg(short, long)]
        collection: String,
        /// Limit
        #[arg(short, long, default_value = "10")]
        limit: u32,
    },

    /// Delete a record
    #[command(alias = "d")]
    Delete {
        /// Collection (e.g., ai.syui.log.post)
        #[arg(short, long)]
        collection: String,
        /// Record key
        #[arg(short, long)]
        rkey: String,
        /// Delete as bot (uses bot.json)
        #[arg(long)]
        bot: bool,
    },

    /// Sync PDS data to local content directory
    #[command(alias = "s")]
    Sync {
        /// Output directory
        #[arg(short, long, default_value = "public/at")]
        output: String,
        /// Sync bot data (uses bot.json)
        #[arg(long)]
        bot: bool,
        /// Collection to sync (for bot)
        #[arg(short, long)]
        collection: Option<String>,
    },

    /// Push local content to PDS
    Push {
        /// Input directory
        #[arg(short, long, default_value = "public/at")]
        input: String,
        /// Collection (e.g., ai.syui.log.post)
        #[arg(short, long, default_value = "ai.syui.log.post")]
        collection: String,
        /// Push as bot (uses bot.json)
        #[arg(long)]
        bot: bool,
    },

    /// Generate lexicon Rust code from ATProto lexicon JSON files
    Gen {
        /// Input directory containing lexicon JSON files
        #[arg(short, long, default_value = "./repos/atproto/lexicons")]
        input: String,
        /// Output directory for generated Rust code
        #[arg(short, long, default_value = "./src/lexicons")]
        output: String,
    },

    /// Translate content files
    Lang {
        /// Input file or directory
        input: String,
        /// Source language
        #[arg(short, long, default_value = "ja")]
        from: String,
        /// Target language
        #[arg(short, long, default_value = "en")]
        to: String,
    },

    /// Resolve handle to DID
    Did {
        /// Handle (e.g., syui.ai)
        handle: String,
        /// Server
        #[arg(short, long, default_value = "bsky.social")]
        server: String,
    },

    /// Reply to a post
    Reply {
        /// Reply text
        text: String,
        /// Parent post URI (at://...)
        #[arg(long)]
        uri: Option<String>,
        /// Parent post CID
        #[arg(long)]
        cid: Option<String>,
        /// Root post URI (defaults to parent if omitted)
        #[arg(long)]
        root_uri: Option<String>,
        /// Root post CID (defaults to parent if omitted)
        #[arg(long)]
        root_cid: Option<String>,
        /// JSON with root/parent info (from `notify listen` output)
        #[arg(long)]
        json: Option<String>,
    },

    /// Chat with AI
    #[command(alias = "c")]
    Chat {
        /// Message to send (optional, starts interactive mode if omitted)
        message: Option<String>,
        /// Start new conversation
        #[arg(long)]
        new: bool,
    },

    /// Run MCP server (for Claude Code integration)
    #[command(name = "mcp-serve")]
    McpServe,

    /// Rebuild index.json files for content collections
    #[command(alias = "i")]
    Index {
        /// Content directory
        #[arg(short, long, default_value = "public/at")]
        dir: String,
    },

    /// Show ailog version
    #[command(alias = "v")]
    Version,

    /// Notification commands
    #[command(alias = "n")]
    Notify {
        #[command(subcommand)]
        command: NotifyCommands,
    },

    /// PDS commands
    Pds {
        #[command(subcommand)]
        command: PdsCommands,
    },

    /// GPT core/memory commands
    Gpt {
        #[command(subcommand)]
        command: GptCommands,
    },

    /// Bot commands
    #[command(alias = "b")]
    Bot {
        #[command(subcommand)]
        command: BotCommands,
    },

    /// OAuth login to ATProto PDS
    Oauth {
        /// Handle (e.g., syui.syui.ai)
        handle: String,
        /// Login as bot (saves to bot.json)
        #[arg(long)]
        bot: bool,
    },

    /// Initialize config
    Setup,

    /// Two-factor authentication (email 2FA)
    #[command(name = "2fa")]
    TwoFa {
        #[command(subcommand)]
        command: TwoFaCommands,
    },
}

#[derive(Subcommand)]
enum TwoFaCommands {
    /// Show 2FA status
    Status {
        #[arg(long)]
        bot: bool,
    },
    /// Enable email 2FA
    Enable {
        #[arg(long)]
        bot: bool,
        /// Account email (prompted if not available from session)
        #[arg(short, long)]
        email: Option<String>,
    },
    /// Disable email 2FA
    Disable {
        #[arg(long)]
        bot: bool,
        /// Account email (prompted if not available from session)
        #[arg(short, long)]
        email: Option<String>,
    },
}

#[derive(Subcommand)]
enum NotifyCommands {
    /// List notifications (JSON)
    #[command(alias = "ls")]
    List {
        /// Max number of notifications
        #[arg(short, long, default_value = "25")]
        limit: u32,
    },
    /// Get unread count (JSON)
    Count,
    /// Mark all notifications as seen
    Seen,
    /// Poll for new notifications (runs continuously, NDJSON output)
    Listen {
        /// Poll interval in seconds
        #[arg(short, long, default_value = "30")]
        interval: u64,
        /// Filter by reason (mention, reply, like, repost, follow, quote)
        #[arg(short, long)]
        reason: Vec<String>,
    },
}

#[derive(Subcommand)]
enum BotCommands {
    /// Start the bot (poll notifications and reply)
    Start {
        /// Poll interval in seconds
        #[arg(short, long, default_value = "30")]
        interval: u64,
        /// Path to config.json
        #[arg(short, long, default_value = "public/config.json")]
        config: String,
    },
}

#[derive(Subcommand)]
enum GptCommands {
    /// Show core record (AI identity/personality)
    Core {
        /// Download to local content directory
        #[arg(short, long)]
        download: bool,
    },
    /// Show latest memory record
    Memory {
        /// Download to local content directory
        #[arg(short, long)]
        download: bool,
        /// List all memory versions
        #[arg(short, long)]
        list: bool,
    },
    /// Push core/memory records to PDS
    Push {
        /// Collection to push (core or memory)
        collection: String,
    },
}

#[derive(Subcommand)]
enum PdsCommands {
    /// Check PDS versions
    #[command(alias = "v")]
    Version {
        /// Networks JSON file
        #[arg(short, long, default_value = "public/networks.json")]
        networks: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    // Load .env file if exists
    dotenvy::dotenv().ok();

    let cli = Cli::parse();

    match cli.command {
        Commands::Login { handle, password, server, bot } => {
            commands::auth::login(&handle, &password, &server, bot).await?;
        }
        Commands::Lexicon { file } => {
            commands::record::put_lexicon(&file).await?;
        }
        Commands::Post { file, collection, rkey } => {
            commands::record::put_record(&file, &collection, rkey.as_deref()).await?;
        }
        Commands::Get { collection, limit } => {
            commands::record::get_records(&collection, limit).await?;
        }
        Commands::Delete { collection, rkey, bot } => {
            commands::record::delete_record(&collection, &rkey, bot).await?;
        }
        Commands::Sync { output, bot, collection } => {
            commands::sync::sync_to_local(&output, bot, collection.as_deref()).await?;
        }
        Commands::Push { input, collection, bot } => {
            commands::push::push_to_remote(&input, &collection, bot).await?;
        }
        Commands::Gen { input, output } => {
            commands::gen::generate(&input, &output)?;
        }
        Commands::Lang { input, from, to } => {
            commands::lang::translate(&input, &from, &to).await?;
        }
        Commands::Did { handle, server } => {
            commands::did::resolve(&handle, &server).await?;
        }
        Commands::Reply { text, uri, cid, root_uri, root_cid, json } => {
            if let Some(json_str) = json {
                commands::reply::reply_json(&json_str, &text).await?;
            } else {
                let parent_uri = uri.as_deref()
                    .expect("--uri is required (or use --json)");
                let parent_cid = cid.as_deref()
                    .expect("--cid is required (or use --json)");
                let r_uri = root_uri.as_deref().unwrap_or(parent_uri);
                let r_cid = root_cid.as_deref().unwrap_or(parent_cid);
                commands::reply::reply(&text, r_uri, r_cid, parent_uri, parent_cid).await?;
            }
        }
        Commands::Chat { message, new } => {
            lms::chat::run(message.as_deref(), new).await?;
        }
        Commands::McpServe => {
            mcp::serve()?;
        }
        Commands::Index { dir } => {
            commands::index::run(std::path::Path::new(&dir))?;
        }
        Commands::Version => {
            println!("{}", env!("CARGO_PKG_VERSION"));
        }
        Commands::Notify { command } => {
            match command {
                NotifyCommands::List { limit } => {
                    commands::notify::list(limit).await?;
                }
                NotifyCommands::Count => {
                    commands::notify::count().await?;
                }
                NotifyCommands::Seen => {
                    commands::notify::update_seen().await?;
                }
                NotifyCommands::Listen { interval, reason } => {
                    commands::notify::listen(interval, &reason).await?;
                }
            }
        }
        Commands::Bot { command } => {
            match command {
                BotCommands::Start { interval, config } => {
                    commands::bot::start(interval, &config).await?;
                }
            }
        }
        Commands::Pds { command } => {
            match command {
                PdsCommands::Version { networks } => {
                    commands::pds::check_versions(&networks).await?;
                }
            }
        }
        Commands::Oauth { handle, bot } => {
            commands::oauth::oauth_login(&handle, bot).await?;
        }
        Commands::Setup => {
            commands::setup::run()?;
        }
        Commands::TwoFa { command } => {
            match command {
                TwoFaCommands::Status { bot } => {
                    commands::twofa::status(bot).await?;
                }
                TwoFaCommands::Enable { bot, email } => {
                    commands::twofa::enable(bot, email.as_deref()).await?;
                }
                TwoFaCommands::Disable { bot, email } => {
                    commands::twofa::disable(bot, email.as_deref()).await?;
                }
            }
        }
        Commands::Gpt { command } => {
            match command {
                GptCommands::Core { download } => {
                    commands::gpt::get_core(download).await?;
                }
                GptCommands::Memory { download, list } => {
                    if list {
                        commands::gpt::list_memory().await?;
                    } else {
                        commands::gpt::get_memory(download).await?;
                    }
                }
                GptCommands::Push { collection } => {
                    commands::gpt::push(&collection).await?;
                }
            }
        }
    }

    Ok(())
}
