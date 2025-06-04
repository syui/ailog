use anyhow::Result;
use colored::Colorize;
use std::path::PathBuf;
use crate::generator::Generator;
use crate::config::Config;

pub async fn execute(path: PathBuf) -> Result<()> {
    println!("{}", "Building blog...".green());

    // Load configuration
    let config = Config::load(&path)?;
    
    // Create generator
    let generator = Generator::new(path, config)?;
    
    // Build the site
    generator.build().await?;
    
    println!("{}", "Build completed successfully!".green().bold());
    
    Ok(())
}