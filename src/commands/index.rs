use anyhow::Result;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Rebuild index.json files for all collections in content directory
pub fn run(content_dir: &Path) -> Result<()> {
    if !content_dir.exists() {
        println!("Content directory not found: {}", content_dir.display());
        return Ok(());
    }

    let mut total_updated = 0;
    let mut total_created = 0;

    // Iterate through DID directories
    for did_entry in fs::read_dir(content_dir)? {
        let did_entry = did_entry?;
        let did_path = did_entry.path();

        if !did_path.is_dir() {
            continue;
        }

        let did_name = did_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        // Skip non-DID directories
        if !did_name.starts_with("did:") {
            continue;
        }

        // Iterate through collection directories
        for col_entry in fs::read_dir(&did_path)? {
            let col_entry = col_entry?;
            let col_path = col_entry.path();

            if !col_path.is_dir() {
                continue;
            }

            let col_name = col_path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");

            // Collect all rkeys from .json files (excluding special files)
            let mut rkeys: Vec<String> = Vec::new();
            let mut rkey_times: HashMap<String, std::time::SystemTime> = HashMap::new();

            for file_entry in fs::read_dir(&col_path)? {
                let file_entry = file_entry?;
                let file_path = file_entry.path();

                if !file_path.is_file() {
                    continue;
                }

                let filename = file_path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");

                // Skip non-json and special files
                if !filename.ends_with(".json") {
                    continue;
                }
                if filename == "index.json" || filename == "describe.json" || filename == "self.json" {
                    continue;
                }

                // Extract rkey from filename
                let rkey = filename.trim_end_matches(".json").to_string();

                // Get file modification time for sorting
                if let Ok(metadata) = file_entry.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        rkey_times.insert(rkey.clone(), modified);
                    }
                }

                rkeys.push(rkey);
            }

            if rkeys.is_empty() {
                continue;
            }

            // Sort by modification time (oldest first) or alphabetically
            rkeys.sort_by(|a, b| {
                match (rkey_times.get(a), rkey_times.get(b)) {
                    (Some(ta), Some(tb)) => ta.cmp(tb),
                    _ => a.cmp(b),
                }
            });

            // Check existing index.json
            let index_path = col_path.join("index.json");
            let existing: Vec<String> = if index_path.exists() {
                fs::read_to_string(&index_path)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default()
            } else {
                Vec::new()
            };

            // Compare and update if different
            if existing != rkeys {
                fs::write(&index_path, serde_json::to_string_pretty(&rkeys)?)?;

                if existing.is_empty() && !index_path.exists() {
                    println!("  Created: {}/{}/index.json ({} records)", did_name, col_name, rkeys.len());
                    total_created += 1;
                } else {
                    println!("  Updated: {}/{}/index.json ({} -> {} records)",
                        did_name, col_name, existing.len(), rkeys.len());
                    total_updated += 1;
                }
            }
        }
    }

    if total_created == 0 && total_updated == 0 {
        println!("All index.json files are up to date.");
    } else {
        println!("\nDone: {} created, {} updated", total_created, total_updated);
    }

    Ok(())
}
