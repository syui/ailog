mod commands;
mod lexicons;
mod lms;
mod mcp;

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
    },

    /// Sync PDS data to local content directory
    #[command(alias = "s")]
    Sync {
        /// Output directory
        #[arg(short, long, default_value = "public/content")]
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
        #[arg(short, long, default_value = "public/content")]
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
        #[arg(short, long, default_value = "public/content")]
        dir: String,
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
            commands::post::put_lexicon(&file).await?;
        }
        Commands::Post { file, collection, rkey } => {
            commands::post::put_record(&file, &collection, rkey.as_deref()).await?;
        }
        Commands::Get { collection, limit } => {
            commands::post::get_records(&collection, limit).await?;
        }
        Commands::Delete { collection, rkey } => {
            commands::post::delete_record(&collection, &rkey).await?;
        }
        Commands::Sync { output, bot, collection } => {
            commands::post::sync_to_local(&output, bot, collection.as_deref()).await?;
        }
        Commands::Push { input, collection, bot } => {
            commands::post::push_to_remote(&input, &collection, bot).await?;
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
        Commands::Chat { message, new } => {
            lms::chat::run(message.as_deref(), new).await?;
        }
        Commands::McpServe => {
            mcp::serve()?;
        }
        Commands::Index { dir } => {
            commands::index::run(std::path::Path::new(&dir))?;
        }
    }

    Ok(())
}
