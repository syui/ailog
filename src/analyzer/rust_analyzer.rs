use anyhow::Result;
use std::collections::HashMap;
use std::path::Path;
use syn::{visit::Visit, ItemEnum, ItemFn, ItemStruct, ItemTrait, Visibility};

use super::*;

pub struct RustAnalyzer;

impl RustAnalyzer {
    pub fn new() -> Self {
        Self
    }

    pub fn analyze_project(&self, path: &Path) -> Result<ProjectInfo> {
        // Parse Cargo.toml
        let cargo_toml_path = path.join("Cargo.toml");
        let cargo_content = std::fs::read_to_string(&cargo_toml_path)?;
        let cargo_toml: toml::Value = toml::from_str(&cargo_content)?;
        
        let package = cargo_toml.get("package").unwrap();
        let name = package.get("name").unwrap().as_str().unwrap().to_string();
        let description = package.get("description").map(|v| v.as_str().unwrap().to_string());
        let version = package.get("version").unwrap().as_str().unwrap().to_string();
        let authors = package
            .get("authors")
            .map(|v| {
                v.as_array()
                    .unwrap()
                    .iter()
                    .map(|a| a.as_str().unwrap().to_string())
                    .collect()
            })
            .unwrap_or_default();
        let license = package.get("license").map(|v| v.as_str().unwrap().to_string());

        // Parse dependencies
        let dependencies = self.parse_dependencies(&cargo_toml)?;

        // Analyze source code
        let src_path = path.join("src");
        let modules = self.analyze_modules(&src_path)?;

        // Calculate metrics
        let metrics = self.calculate_metrics(&modules, &dependencies);

        // Analyze structure
        let structure = self.analyze_project_structure(path)?;

        Ok(ProjectInfo {
            name,
            description,
            version,
            authors,
            license,
            dependencies,
            modules,
            structure,
            metrics,
        })
    }

    fn parse_dependencies(&self, cargo_toml: &toml::Value) -> Result<HashMap<String, String>> {
        let mut dependencies = HashMap::new();

        if let Some(deps) = cargo_toml.get("dependencies") {
            if let Some(deps_table) = deps.as_table() {
                for (name, value) in deps_table {
                    let version = match value {
                        toml::Value::String(v) => v.clone(),
                        toml::Value::Table(t) => {
                            t.get("version")
                                .and_then(|v| v.as_str())
                                .unwrap_or("*")
                                .to_string()
                        }
                        _ => "*".to_string(),
                    };
                    dependencies.insert(name.clone(), version);
                }
            }
        }

        Ok(dependencies)
    }

    fn analyze_modules(&self, src_path: &Path) -> Result<Vec<ModuleInfo>> {
        let mut modules = Vec::new();

        if !src_path.exists() {
            return Ok(modules);
        }

        // Walk through all .rs files
        for entry in walkdir::WalkDir::new(src_path) {
            let entry = entry?;
            if entry.file_type().is_file() {
                if let Some(extension) = entry.path().extension() {
                    if extension == "rs" {
                        if let Ok(module) = self.analyze_rust_file(entry.path()) {
                            modules.push(module);
                        }
                    }
                }
            }
        }

        Ok(modules)
    }

    fn analyze_rust_file(&self, file_path: &Path) -> Result<ModuleInfo> {
        let content = std::fs::read_to_string(file_path)?;
        let syntax_tree = syn::parse_file(&content)?;

        let mut visitor = RustVisitor::new();
        visitor.visit_file(&syntax_tree);

        let module_name = file_path
            .file_stem()
            .unwrap()
            .to_string_lossy()
            .to_string();

        // Extract module-level documentation
        let docs = self.extract_module_docs(&content);

        Ok(ModuleInfo {
            name: module_name,
            path: file_path.to_path_buf(),
            functions: visitor.functions,
            structs: visitor.structs,
            enums: visitor.enums,
            traits: visitor.traits,
            docs,
        })
    }

    fn extract_module_docs(&self, content: &str) -> Option<String> {
        let lines: Vec<&str> = content.lines().collect();
        let mut doc_lines = Vec::new();
        let mut in_module_doc = false;

        for line in lines {
            let trimmed = line.trim();
            if trimmed.starts_with("//!") {
                in_module_doc = true;
                doc_lines.push(trimmed.trim_start_matches("//!").trim());
            } else if trimmed.starts_with("/*!") {
                in_module_doc = true;
                let content = trimmed.trim_start_matches("/*!").trim_end_matches("*/").trim();
                doc_lines.push(content);
            } else if in_module_doc && !trimmed.is_empty() && !trimmed.starts_with("//") {
                break;
            }
        }

        if doc_lines.is_empty() {
            None
        } else {
            Some(doc_lines.join("\n"))
        }
    }

    fn calculate_metrics(&self, modules: &[ModuleInfo], dependencies: &HashMap<String, String>) -> ProjectMetrics {
        let total_lines = modules.iter().map(|m| {
            std::fs::read_to_string(&m.path)
                .map(|content| content.lines().count())
                .unwrap_or(0)
        }).sum();

        let total_files = modules.len();
        let test_files = modules.iter().filter(|m| {
            m.name.contains("test") || m.path.to_string_lossy().contains("/tests/")
        }).count();

        let dependency_count = dependencies.len();

        // Simple complexity calculation based on number of functions and structs
        let complexity_score = modules.iter().map(|m| {
            (m.functions.len() + m.structs.len() + m.enums.len() + m.traits.len()) as f32
        }).sum::<f32>() / modules.len().max(1) as f32;

        ProjectMetrics {
            total_lines,
            total_files,
            test_files,
            dependency_count,
            complexity_score,
            test_coverage: None, // TODO: Implement test coverage calculation
        }
    }

    fn analyze_project_structure(&self, path: &Path) -> Result<ProjectStructure> {
        let mut directories = Vec::new();
        let mut files = Vec::new();

        self.walk_directory(path, &mut directories, &mut files)?;

        Ok(ProjectStructure {
            directories,
            files,
            dependency_graph: HashMap::new(), // TODO: Implement dependency graph
        })
    }

    fn walk_directory(
        &self,
        path: &Path,
        directories: &mut Vec<DirectoryInfo>,
        files: &mut Vec<FileInfo>,
    ) -> Result<()> {
        for entry in walkdir::WalkDir::new(path).max_depth(3) {
            let entry = entry?;
            let relative_path = entry.path().strip_prefix(path)?;

            if entry.file_type().is_dir() && relative_path != Path::new("") {
                let file_count = std::fs::read_dir(entry.path())?
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
                    .count();

                let subdirectories = std::fs::read_dir(entry.path())?
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect();

                directories.push(DirectoryInfo {
                    name: entry.path().file_name().unwrap().to_string_lossy().to_string(),
                    path: relative_path.to_path_buf(),
                    file_count,
                    subdirectories,
                });
            } else if entry.file_type().is_file() {
                let language = match entry.path().extension().and_then(|s| s.to_str()) {
                    Some("rs") => "rust".to_string(),
                    Some("toml") => "toml".to_string(),
                    Some("md") => "markdown".to_string(),
                    _ => "unknown".to_string(),
                };

                let lines_of_code = std::fs::read_to_string(entry.path())
                    .map(|content| content.lines().count())
                    .unwrap_or(0);

                let is_test = entry.path().to_string_lossy().contains("test");

                files.push(FileInfo {
                    name: entry.path().file_name().unwrap().to_string_lossy().to_string(),
                    path: relative_path.to_path_buf(),
                    language,
                    lines_of_code,
                    is_test,
                });
            }
        }

        Ok(())
    }
}

struct RustVisitor {
    functions: Vec<FunctionInfo>,
    structs: Vec<StructInfo>,
    enums: Vec<EnumInfo>,
    traits: Vec<TraitInfo>,
    current_line: usize,
}

impl RustVisitor {
    fn new() -> Self {
        Self {
            functions: Vec::new(),
            structs: Vec::new(),
            enums: Vec::new(),
            traits: Vec::new(),
            current_line: 1,
        }
    }

    fn visibility_to_string(&self, vis: &Visibility) -> String {
        match vis {
            Visibility::Public(_) => "pub".to_string(),
            Visibility::Restricted(_) => "pub(restricted)".to_string(),
            Visibility::Inherited => "private".to_string(),
        }
    }

    fn extract_docs(&self, attrs: &[syn::Attribute]) -> Option<String> {
        let mut docs = Vec::new();
        for attr in attrs {
            if attr.path().is_ident("doc") {
                if let syn::Meta::NameValue(meta) = &attr.meta {
                    if let syn::Expr::Lit(expr_lit) = &meta.value {
                        if let syn::Lit::Str(lit_str) = &expr_lit.lit {
                            docs.push(lit_str.value());
                        }
                    }
                }
            }
        }
        if docs.is_empty() {
            None
        } else {
            Some(docs.join("\n"))
        }
    }
}

impl<'ast> Visit<'ast> for RustVisitor {
    fn visit_item_fn(&mut self, node: &'ast ItemFn) {
        let name = node.sig.ident.to_string();
        let visibility = self.visibility_to_string(&node.vis);
        let is_async = node.sig.asyncness.is_some();
        
        let parameters = node.sig.inputs.iter().map(|input| {
            match input {
                syn::FnArg::Receiver(_) => Parameter {
                    name: "self".to_string(),
                    param_type: "Self".to_string(),
                    is_mutable: false,
                },
                syn::FnArg::Typed(typed) => {
                    let name = match &*typed.pat {
                        syn::Pat::Ident(ident) => ident.ident.to_string(),
                        _ => "unknown".to_string(),
                    };
                    Parameter {
                        name,
                        param_type: quote::quote!(#typed.ty).to_string(),
                        is_mutable: false, // TODO: Detect mutability
                    }
                }
            }
        }).collect();

        let return_type = match &node.sig.output {
            syn::ReturnType::Default => None,
            syn::ReturnType::Type(_, ty) => Some(quote::quote!(#ty).to_string()),
        };

        let docs = self.extract_docs(&node.attrs);

        self.functions.push(FunctionInfo {
            name,
            visibility,
            is_async,
            parameters,
            return_type,
            docs,
            line_number: self.current_line,
        });

        syn::visit::visit_item_fn(self, node);
    }

    fn visit_item_struct(&mut self, node: &'ast ItemStruct) {
        let name = node.ident.to_string();
        let visibility = self.visibility_to_string(&node.vis);
        let docs = self.extract_docs(&node.attrs);

        let fields = match &node.fields {
            syn::Fields::Named(fields) => {
                fields.named.iter().map(|field| {
                    FieldInfo {
                        name: field.ident.as_ref().unwrap().to_string(),
                        field_type: quote::quote!(#field.ty).to_string(),
                        visibility: self.visibility_to_string(&field.vis),
                        docs: self.extract_docs(&field.attrs),
                    }
                }).collect()
            }
            syn::Fields::Unnamed(fields) => {
                fields.unnamed.iter().enumerate().map(|(i, field)| {
                    FieldInfo {
                        name: format!("field_{}", i),
                        field_type: quote::quote!(#field.ty).to_string(),
                        visibility: self.visibility_to_string(&field.vis),
                        docs: self.extract_docs(&field.attrs),
                    }
                }).collect()
            }
            syn::Fields::Unit => Vec::new(),
        };

        self.structs.push(StructInfo {
            name,
            visibility,
            fields,
            docs,
            line_number: self.current_line,
        });

        syn::visit::visit_item_struct(self, node);
    }

    fn visit_item_enum(&mut self, node: &'ast ItemEnum) {
        let name = node.ident.to_string();
        let visibility = self.visibility_to_string(&node.vis);
        let docs = self.extract_docs(&node.attrs);

        let variants = node.variants.iter().map(|variant| {
            let variant_name = variant.ident.to_string();
            let variant_docs = self.extract_docs(&variant.attrs);

            let fields = match &variant.fields {
                syn::Fields::Named(fields) => {
                    fields.named.iter().map(|field| {
                        FieldInfo {
                            name: field.ident.as_ref().unwrap().to_string(),
                            field_type: quote::quote!(#field.ty).to_string(),
                            visibility: self.visibility_to_string(&field.vis),
                            docs: self.extract_docs(&field.attrs),
                        }
                    }).collect()
                }
                syn::Fields::Unnamed(fields) => {
                    fields.unnamed.iter().enumerate().map(|(i, field)| {
                        FieldInfo {
                            name: format!("field_{}", i),
                            field_type: quote::quote!(#field.ty).to_string(),
                            visibility: self.visibility_to_string(&field.vis),
                            docs: self.extract_docs(&field.attrs),
                        }
                    }).collect()
                }
                syn::Fields::Unit => Vec::new(),
            };

            VariantInfo {
                name: variant_name,
                fields,
                docs: variant_docs,
            }
        }).collect();

        self.enums.push(EnumInfo {
            name,
            visibility,
            variants,
            docs,
            line_number: self.current_line,
        });

        syn::visit::visit_item_enum(self, node);
    }

    fn visit_item_trait(&mut self, node: &'ast ItemTrait) {
        let name = node.ident.to_string();
        let visibility = self.visibility_to_string(&node.vis);
        let docs = self.extract_docs(&node.attrs);

        let methods = node.items.iter().filter_map(|item| {
            match item {
                syn::TraitItem::Fn(method) => {
                    let method_name = method.sig.ident.to_string();
                    let method_visibility = "pub".to_string(); // Trait methods are inherently public
                    let is_async = method.sig.asyncness.is_some();
                    
                    let parameters = method.sig.inputs.iter().map(|input| {
                        match input {
                            syn::FnArg::Receiver(_) => Parameter {
                                name: "self".to_string(),
                                param_type: "Self".to_string(),
                                is_mutable: false,
                            },
                            syn::FnArg::Typed(typed) => {
                                let name = match &*typed.pat {
                                    syn::Pat::Ident(ident) => ident.ident.to_string(),
                                    _ => "unknown".to_string(),
                                };
                                Parameter {
                                    name,
                                    param_type: quote::quote!(#typed.ty).to_string(),
                                    is_mutable: false,
                                }
                            }
                        }
                    }).collect();

                    let return_type = match &method.sig.output {
                        syn::ReturnType::Default => None,
                        syn::ReturnType::Type(_, ty) => Some(quote::quote!(#ty).to_string()),
                    };

                    let method_docs = self.extract_docs(&method.attrs);

                    Some(FunctionInfo {
                        name: method_name,
                        visibility: method_visibility,
                        is_async,
                        parameters,
                        return_type,
                        docs: method_docs,
                        line_number: self.current_line,
                    })
                }
                _ => None,
            }
        }).collect();

        self.traits.push(TraitInfo {
            name,
            visibility,
            methods,
            docs,
            line_number: self.current_line,
        });

        syn::visit::visit_item_trait(self, node);
    }
}