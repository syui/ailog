use anyhow::Result;
use regex::Regex;
use super::MarkdownSection;

#[derive(Clone)]
pub struct MarkdownParser {
    _code_block_regex: Regex,
    header_regex: Regex,
    link_regex: Regex,
    image_regex: Regex,
    table_regex: Regex,
    list_regex: Regex,
    quote_regex: Regex,
}

impl MarkdownParser {
    pub fn new() -> Self {
        Self {
            _code_block_regex: Regex::new(r"```([a-zA-Z0-9]*)\n([\s\S]*?)\n```").unwrap(),
            header_regex: Regex::new(r"^(#{1,6})\s+(.+)$").unwrap(),
            link_regex: Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").unwrap(),
            image_regex: Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)").unwrap(),
            table_regex: Regex::new(r"^\|.*\|$").unwrap(),
            list_regex: Regex::new(r"^[\s]*[-*+]\s+(.+)$").unwrap(),
            quote_regex: Regex::new(r"^>\s+(.+)$").unwrap(),
        }
    }
    
    pub fn parse_markdown(&self, content: &str) -> Result<Vec<MarkdownSection>> {
        let mut sections = Vec::new();
        let mut current_text = String::new();
        let lines: Vec<&str> = content.lines().collect();
        let mut i = 0;
        
        while i < lines.len() {
            let line = lines[i];
            
            // Check for code blocks
            if line.starts_with("```") {
                // Save accumulated text
                if !current_text.trim().is_empty() {
                    sections.extend(self.parse_text_sections(&current_text)?);
                    current_text.clear();
                }
                
                // Parse code block
                let (code_section, lines_consumed) = self.parse_code_block(&lines[i..])?;
                sections.push(code_section);
                i += lines_consumed;
                continue;
            }
            
            // Check for headers
            if let Some(caps) = self.header_regex.captures(line) {
                // Save accumulated text
                if !current_text.trim().is_empty() {
                    sections.extend(self.parse_text_sections(&current_text)?);
                    current_text.clear();
                }
                
                let level = caps.get(1).unwrap().as_str().len() as u8;
                let header_text = caps.get(2).unwrap().as_str().to_string();
                sections.push(MarkdownSection::Header(header_text, level));
                i += 1;
                continue;
            }
            
            // Check for tables
            if self.table_regex.is_match(line) {
                // Save accumulated text
                if !current_text.trim().is_empty() {
                    sections.extend(self.parse_text_sections(&current_text)?);
                    current_text.clear();
                }
                
                let (table_section, lines_consumed) = self.parse_table(&lines[i..])?;
                sections.push(table_section);
                i += lines_consumed;
                continue;
            }
            
            // Check for quotes
            if let Some(caps) = self.quote_regex.captures(line) {
                // Save accumulated text
                if !current_text.trim().is_empty() {
                    sections.extend(self.parse_text_sections(&current_text)?);
                    current_text.clear();
                }
                
                let quote_text = caps.get(1).unwrap().as_str().to_string();
                sections.push(MarkdownSection::Quote(quote_text));
                i += 1;
                continue;
            }
            
            // Check for lists
            if let Some(caps) = self.list_regex.captures(line) {
                // Save accumulated text
                if !current_text.trim().is_empty() {
                    sections.extend(self.parse_text_sections(&current_text)?);
                    current_text.clear();
                }
                
                let list_text = caps.get(1).unwrap().as_str().to_string();
                sections.push(MarkdownSection::List(list_text));
                i += 1;
                continue;
            }
            
            // Accumulate regular text
            current_text.push_str(line);
            current_text.push('\n');
            i += 1;
        }
        
        // Process remaining text
        if !current_text.trim().is_empty() {
            sections.extend(self.parse_text_sections(&current_text)?);
        }
        
        Ok(sections)
    }
    
    fn parse_code_block(&self, lines: &[&str]) -> Result<(MarkdownSection, usize)> {
        if lines.is_empty() || !lines[0].starts_with("```") {
            anyhow::bail!("Not a code block");
        }
        
        let first_line = lines[0];
        let language = if first_line.len() > 3 {
            Some(first_line[3..].trim().to_string())
        } else {
            None
        };
        
        let mut content = String::new();
        let mut end_index = 1;
        
        for (i, &line) in lines[1..].iter().enumerate() {
            if line.starts_with("```") {
                end_index = i + 2; // +1 for slice offset, +1 for closing line
                break;
            }
            if i > 0 {
                content.push('\n');
            }
            content.push_str(line);
        }
        
        Ok((MarkdownSection::Code(content, language), end_index))
    }
    
    fn parse_table(&self, lines: &[&str]) -> Result<(MarkdownSection, usize)> {
        let mut table_content = String::new();
        let mut line_count = 0;
        
        for &line in lines {
            if self.table_regex.is_match(line) {
                if line_count > 0 {
                    table_content.push('\n');
                }
                table_content.push_str(line);
                line_count += 1;
            } else {
                break;
            }
        }
        
        Ok((MarkdownSection::Table(table_content), line_count))
    }
    
    fn parse_text_sections(&self, text: &str) -> Result<Vec<MarkdownSection>> {
        let mut sections = Vec::new();
        let mut remaining = text;
        
        // Look for images first (they should be preserved)
        while let Some(caps) = self.image_regex.captures(remaining) {
            let full_match = caps.get(0).unwrap();
            let before = &remaining[..full_match.start()];
            let alt = caps.get(1).unwrap().as_str().to_string();
            let url = caps.get(2).unwrap().as_str().to_string();
            
            if !before.trim().is_empty() {
                sections.push(MarkdownSection::Text(before.to_string()));
            }
            
            sections.push(MarkdownSection::Image(alt, url));
            remaining = &remaining[full_match.end()..];
        }
        
        // Look for links
        let mut current_text = remaining.to_string();
        while let Some(caps) = self.link_regex.captures(&current_text) {
            let full_match = caps.get(0).unwrap();
            let before = &current_text[..full_match.start()];
            let link_text = caps.get(1).unwrap().as_str().to_string();
            let url = caps.get(2).unwrap().as_str().to_string();
            
            if !before.trim().is_empty() {
                sections.push(MarkdownSection::Text(before.to_string()));
            }
            
            sections.push(MarkdownSection::Link(link_text, url));
            current_text = current_text[full_match.end()..].to_string();
        }
        
        // Add remaining text
        if !current_text.trim().is_empty() {
            sections.push(MarkdownSection::Text(current_text));
        }
        
        Ok(sections)
    }
    
    pub fn rebuild_markdown(&self, sections: Vec<MarkdownSection>) -> String {
        let mut result = String::new();
        
        for section in sections {
            match section {
                MarkdownSection::Text(text) => {
                    result.push_str(&text);
                }
                MarkdownSection::Code(content, Some(lang)) => {
                    result.push_str(&format!("```{}\n{}\n```\n", lang, content));
                }
                MarkdownSection::Code(content, None) => {
                    result.push_str(&format!("```\n{}\n```\n", content));
                }
                MarkdownSection::Header(text, level) => {
                    let hashes = "#".repeat(level as usize);
                    result.push_str(&format!("{} {}\n", hashes, text));
                }
                MarkdownSection::Link(text, url) => {
                    result.push_str(&format!("[{}]({})", text, url));
                }
                MarkdownSection::Image(alt, url) => {
                    result.push_str(&format!("![{}]({})", alt, url));
                }
                MarkdownSection::Table(content) => {
                    result.push_str(&content);
                    result.push('\n');
                }
                MarkdownSection::List(text) => {
                    result.push_str(&format!("- {}\n", text));
                }
                MarkdownSection::Quote(text) => {
                    result.push_str(&format!("> {}\n", text));
                }
            }
        }
        
        result
    }
}