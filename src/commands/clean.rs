use anyhow::Result;
use colored::Colorize;
use std::fs;
use std::path::Path;

pub async fn execute() -> Result<()> {
    println!("{}", "Cleaning build artifacts...".yellow());

    let public_dir = Path::new("public");
    
    if public_dir.exists() {
        fs::remove_dir_all(public_dir)?;
        println!("{} public directory", "Removed".cyan());
    } else {
        println!("{}", "No build artifacts to clean");
    }

    println!("{}", "Clean completed!".green().bold());
    
    Ok(())
}