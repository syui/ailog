use anyhow::Result;
use std::path::PathBuf;
use crate::analyzer::{ProjectInfo, ApiInfo, ProjectStructure};
use crate::ai::gpt_client::GptClient;

#[allow(dead_code)]
pub struct DocGenerator {
    base_path: PathBuf,
    ai_enabled: bool,
    templates: DocTemplates,
}

pub struct DocTemplates {
    readme_template: String,
    api_template: String,
    structure_template: String,
    changelog_template: String,
}

impl DocGenerator {
    pub fn new(base_path: PathBuf, ai_enabled: bool) -> Self {
        let templates = DocTemplates::default();
        Self {
            base_path,
            ai_enabled,
            templates,
        }
    }

    pub async fn generate_readme(&self, project_info: &ProjectInfo) -> Result<String> {
        let mut content = self.templates.readme_template.clone();
        
        // Simple template substitution
        content = content.replace("{{name}}", &project_info.name);
        content = content.replace("{{description}}", 
            &project_info.description.as_ref().unwrap_or(&"A Rust project".to_string()));
        content = content.replace("{{module_count}}", &project_info.modules.len().to_string());
        content = content.replace("{{total_lines}}", &project_info.metrics.total_lines.to_string());
        
        let deps = project_info.dependencies.iter()
            .map(|(name, version)| format!("- {}: {}", name, version))
            .collect::<Vec<_>>()
            .join("\n");
        content = content.replace("{{dependencies}}", &deps);
        content = content.replace("{{license}}", 
            &project_info.license.as_ref().unwrap_or(&"MIT".to_string()));
        
        if self.ai_enabled {
            content = self.enhance_with_ai(&content, "readme").await?;
        }
        
        Ok(content)
    }

    pub async fn generate_api_markdown(&self, api_info: &ApiInfo) -> Result<Vec<(String, String)>> {
        let mut files = Vec::new();
        
        // Generate main API documentation
        let main_content = self.templates.api_template.replace("{{content}}", "Generated API Documentation");
        files.push(("api.md".to_string(), main_content));
        
        // Generate individual module docs
        for module in &api_info.modules {
            if !module.functions.is_empty() || !module.structs.is_empty() {
                let module_content = self.generate_module_doc(module).await?;
                files.push((format!("{}.md", module.name), module_content));
            }
        }
        
        Ok(files)
    }

    pub async fn generate_structure_doc(&self, structure: &ProjectStructure) -> Result<String> {
        let content = self.templates.structure_template.replace("{{content}}", 
            &format!("Found {} directories and {} files", 
                structure.directories.len(), 
                structure.files.len()));
        Ok(content)
    }

    pub async fn generate_changelog(&self, from: Option<String>, to: Option<String>) -> Result<String> {
        let commits = self.get_git_commits(from, to)?;
        
        let mut content = self.templates.changelog_template.replace("{{content}}", 
            &format!("Found {} commits", commits.len()));
        
        if self.ai_enabled {
            content = self.enhance_changelog_with_ai(&content, &commits).await?;
        }
        
        Ok(content)
    }


    async fn enhance_with_ai(&self, content: &str, doc_type: &str) -> Result<String> {
        if !self.ai_enabled {
            return Ok(content.to_string());
        }

        let gpt_client = GptClient::new(
            std::env::var("OPENAI_API_KEY").unwrap_or_default(),
            None,
        );

        let prompt = format!(
            "Enhance this {} documentation with additional insights and improve readability:\n\n{}",
            doc_type, content
        );

        match gpt_client.chat("You are a technical writer helping to improve documentation.", &prompt).await {
            Ok(enhanced) => Ok(enhanced),
            Err(_) => Ok(content.to_string()), // Fallback to original content
        }
    }

    async fn generate_module_doc(&self, module: &crate::analyzer::ModuleInfo) -> Result<String> {
        let mut content = format!("# Module: {}\n\n", module.name);
        
        if let Some(docs) = &module.docs {
            content.push_str(&format!("{}\n\n", docs));
        }

        // Add functions
        if !module.functions.is_empty() {
            content.push_str("## Functions\n\n");
            for func in &module.functions {
                content.push_str(&self.format_function_doc(func));
            }
        }

        // Add structs
        if !module.structs.is_empty() {
            content.push_str("## Structs\n\n");
            for struct_info in &module.structs {
                content.push_str(&self.format_struct_doc(struct_info));
            }
        }

        Ok(content)
    }

    fn format_function_doc(&self, func: &crate::analyzer::FunctionInfo) -> String {
        let mut doc = format!("### `{}`\n\n", func.name);
        
        if let Some(docs) = &func.docs {
            doc.push_str(&format!("{}\n\n", docs));
        }

        doc.push_str(&format!("**Visibility:** `{}`\n", func.visibility));
        
        if func.is_async {
            doc.push_str("**Async:** Yes\n");
        }

        if !func.parameters.is_empty() {
            doc.push_str("\n**Parameters:**\n");
            for param in &func.parameters {
                doc.push_str(&format!("- `{}`: `{}`\n", param.name, param.param_type));
            }
        }

        if let Some(return_type) = &func.return_type {
            doc.push_str(&format!("\n**Returns:** `{}`\n", return_type));
        }

        doc.push_str("\n---\n\n");
        doc
    }

    fn format_struct_doc(&self, struct_info: &crate::analyzer::StructInfo) -> String {
        let mut doc = format!("### `{}`\n\n", struct_info.name);
        
        if let Some(docs) = &struct_info.docs {
            doc.push_str(&format!("{}\n\n", docs));
        }

        doc.push_str(&format!("**Visibility:** `{}`\n\n", struct_info.visibility));

        if !struct_info.fields.is_empty() {
            doc.push_str("**Fields:**\n");
            for field in &struct_info.fields {
                doc.push_str(&format!("- `{}`: `{}` ({})\n", field.name, field.field_type, field.visibility));
                if let Some(field_docs) = &field.docs {
                    doc.push_str(&format!("  - {}\n", field_docs));
                }
            }
        }

        doc.push_str("\n---\n\n");
        doc
    }

    async fn enhance_changelog_with_ai(&self, content: &str, _commits: &[GitCommit]) -> Result<String> {
        // TODO: Implement AI-enhanced changelog generation
        Ok(content.to_string())
    }

    fn get_git_commits(&self, _from: Option<String>, _to: Option<String>) -> Result<Vec<GitCommit>> {
        // TODO: Implement git history parsing
        Ok(vec![])
    }
}

#[derive(Debug)]
#[allow(dead_code)]
pub struct GitCommit {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

impl DocTemplates {
    fn default() -> Self {
        Self {
            readme_template: r#"# {{name}}

{{description}}

## Overview

This project contains {{module_count}} modules with {{total_lines}} lines of code.

## Dependencies

{{dependencies}}

## License

{{license}}
"#.to_string(),
            api_template: "# API Documentation\n\n{{content}}".to_string(),
            structure_template: "# Project Structure\n\n{{content}}".to_string(),
            changelog_template: "# Changelog\n\n{{content}}".to_string(),
        }
    }
}