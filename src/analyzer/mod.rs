pub mod rust_analyzer;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub description: Option<String>,
    pub version: String,
    pub authors: Vec<String>,
    pub license: Option<String>,
    pub dependencies: HashMap<String, String>,
    pub modules: Vec<ModuleInfo>,
    pub structure: ProjectStructure,
    pub metrics: ProjectMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleInfo {
    pub name: String,
    pub path: PathBuf,
    pub functions: Vec<FunctionInfo>,
    pub structs: Vec<StructInfo>,
    pub enums: Vec<EnumInfo>,
    pub traits: Vec<TraitInfo>,
    pub docs: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionInfo {
    pub name: String,
    pub visibility: String,
    pub is_async: bool,
    pub parameters: Vec<Parameter>,
    pub return_type: Option<String>,
    pub docs: Option<String>,
    pub line_number: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    pub name: String,
    pub param_type: String,
    pub is_mutable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructInfo {
    pub name: String,
    pub visibility: String,
    pub fields: Vec<FieldInfo>,
    pub docs: Option<String>,
    pub line_number: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldInfo {
    pub name: String,
    pub field_type: String,
    pub visibility: String,
    pub docs: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnumInfo {
    pub name: String,
    pub visibility: String,
    pub variants: Vec<VariantInfo>,
    pub docs: Option<String>,
    pub line_number: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariantInfo {
    pub name: String,
    pub fields: Vec<FieldInfo>,
    pub docs: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraitInfo {
    pub name: String,
    pub visibility: String,
    pub methods: Vec<FunctionInfo>,
    pub docs: Option<String>,
    pub line_number: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectStructure {
    pub directories: Vec<DirectoryInfo>,
    pub files: Vec<FileInfo>,
    pub dependency_graph: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryInfo {
    pub name: String,
    pub path: PathBuf,
    pub file_count: usize,
    pub subdirectories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: PathBuf,
    pub language: String,
    pub lines_of_code: usize,
    pub is_test: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetrics {
    pub total_lines: usize,
    pub total_files: usize,
    pub test_files: usize,
    pub dependency_count: usize,
    pub complexity_score: f32,
    pub test_coverage: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiInfo {
    pub modules: Vec<ModuleInfo>,
    pub public_functions: Vec<FunctionInfo>,
    pub public_structs: Vec<StructInfo>,
    pub public_enums: Vec<EnumInfo>,
    pub public_traits: Vec<TraitInfo>,
}

pub struct CodeAnalyzer {
    rust_analyzer: rust_analyzer::RustAnalyzer,
}

impl CodeAnalyzer {
    pub fn new() -> Self {
        Self {
            rust_analyzer: rust_analyzer::RustAnalyzer::new(),
        }
    }

    pub fn analyze_project(&self, path: &Path) -> Result<ProjectInfo> {
        println!("  🔍 Analyzing project at: {}", path.display());
        
        // Check if this is a Rust project
        let cargo_toml = path.join("Cargo.toml");
        if cargo_toml.exists() {
            return self.rust_analyzer.analyze_project(path);
        }
        
        // For now, only support Rust projects
        anyhow::bail!("Only Rust projects are currently supported");
    }

    pub fn analyze_api(&self, path: &Path) -> Result<ApiInfo> {
        println!("  📚 Analyzing API at: {}", path.display());
        
        let project_info = self.analyze_project(path.parent().unwrap_or(path))?;
        
        // Extract only public items
        let mut public_functions = Vec::new();
        let mut public_structs = Vec::new();
        let mut public_enums = Vec::new();
        let mut public_traits = Vec::new();
        
        for module in &project_info.modules {
            for func in &module.functions {
                if func.visibility == "pub" {
                    public_functions.push(func.clone());
                }
            }
            for struct_info in &module.structs {
                if struct_info.visibility == "pub" {
                    public_structs.push(struct_info.clone());
                }
            }
            for enum_info in &module.enums {
                if enum_info.visibility == "pub" {
                    public_enums.push(enum_info.clone());
                }
            }
            for trait_info in &module.traits {
                if trait_info.visibility == "pub" {
                    public_traits.push(trait_info.clone());
                }
            }
        }
        
        Ok(ApiInfo {
            modules: project_info.modules,
            public_functions,
            public_structs,
            public_enums,
            public_traits,
        })
    }

    pub fn analyze_structure(&self, path: &Path, include_deps: bool) -> Result<ProjectStructure> {
        println!("  🏗️  Analyzing structure at: {}", path.display());
        
        let mut directories = Vec::new();
        let mut files = Vec::new();
        let mut dependency_graph = HashMap::new();
        
        self.walk_directory(path, &mut directories, &mut files)?;
        
        if include_deps {
            dependency_graph = self.analyze_dependencies(path)?;
        }
        
        Ok(ProjectStructure {
            directories,
            files,
            dependency_graph,
        })
    }

    fn walk_directory(
        &self,
        path: &Path,
        directories: &mut Vec<DirectoryInfo>,
        files: &mut Vec<FileInfo>,
    ) -> Result<()> {
        use walkdir::WalkDir;
        
        let walker = WalkDir::new(path)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                // Skip hidden files and common build/cache directories
                !name.starts_with('.') 
                    && name != "target" 
                    && name != "node_modules"
                    && name != "dist"
            });
        
        for entry in walker {
            let entry = entry?;
            let path = entry.path();
            let relative_path = path.strip_prefix(path.ancestors().last().unwrap())?;
            
            if entry.file_type().is_dir() {
                let file_count = std::fs::read_dir(path)?
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
                    .count();
                
                let subdirectories = std::fs::read_dir(path)?
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect();
                
                directories.push(DirectoryInfo {
                    name: path.file_name().unwrap().to_string_lossy().to_string(),
                    path: relative_path.to_path_buf(),
                    file_count,
                    subdirectories,
                });
            } else if entry.file_type().is_file() {
                let language = self.detect_language(path);
                let lines_of_code = self.count_lines(path)?;
                let is_test = self.is_test_file(path);
                
                files.push(FileInfo {
                    name: path.file_name().unwrap().to_string_lossy().to_string(),
                    path: relative_path.to_path_buf(),
                    language,
                    lines_of_code,
                    is_test,
                });
            }
        }
        
        Ok(())
    }

    fn detect_language(&self, path: &Path) -> String {
        match path.extension().and_then(|s| s.to_str()) {
            Some("rs") => "rust".to_string(),
            Some("py") => "python".to_string(),
            Some("js") => "javascript".to_string(),
            Some("ts") => "typescript".to_string(),
            Some("md") => "markdown".to_string(),
            Some("toml") => "toml".to_string(),
            Some("json") => "json".to_string(),
            Some("yaml") | Some("yml") => "yaml".to_string(),
            _ => "unknown".to_string(),
        }
    }

    fn count_lines(&self, path: &Path) -> Result<usize> {
        let content = std::fs::read_to_string(path)?;
        Ok(content.lines().count())
    }

    fn is_test_file(&self, path: &Path) -> bool {
        let filename = path.file_name().unwrap().to_string_lossy();
        filename.contains("test") 
            || filename.starts_with("test_")
            || path.to_string_lossy().contains("/tests/")
    }

    fn analyze_dependencies(&self, _path: &Path) -> Result<HashMap<String, Vec<String>>> {
        // For now, just return empty dependencies
        // TODO: Implement actual dependency analysis
        Ok(HashMap::new())
    }
}