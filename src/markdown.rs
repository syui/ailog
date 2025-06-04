use anyhow::Result;
use pulldown_cmark::{html, Options, Parser, CodeBlockKind};
use syntect::parsing::SyntaxSet;
use syntect::highlighting::ThemeSet;
use syntect::html::{styled_line_to_highlighted_html, IncludeBackground};
use gray_matter::Matter;
use gray_matter::engine::YAML;
use serde_json::Value;

pub struct MarkdownProcessor {
    highlight_code: bool,
    syntax_set: SyntaxSet,
    theme_set: ThemeSet,
}

impl MarkdownProcessor {
    pub fn new(highlight_code: bool) -> Self {
        Self {
            highlight_code,
            syntax_set: SyntaxSet::load_defaults_newlines(),
            theme_set: ThemeSet::load_defaults(),
        }
    }

    pub fn parse_frontmatter(&self, content: &str) -> Result<(serde_json::Map<String, Value>, String)> {
        let matter = Matter::<YAML>::new();
        let result = matter.parse(content);
        
        let frontmatter = result.data
            .and_then(|pod| pod.as_hashmap().ok())
            .map(|map| {
                let mut json_map = serde_json::Map::new();
                for (k, v) in map {
                    // Keys in hashmap are already strings
                    let value = self.pod_to_json_value(v);
                    json_map.insert(k, value);
                }
                json_map
            })
            .unwrap_or_default();

        Ok((frontmatter, result.content))
    }

    fn pod_to_json_value(&self, pod: gray_matter::Pod) -> Value {
        match pod {
            gray_matter::Pod::Null => Value::Null,
            gray_matter::Pod::Boolean(b) => Value::Bool(b),
            gray_matter::Pod::Integer(i) => Value::Number(serde_json::Number::from(i)),
            gray_matter::Pod::Float(f) => serde_json::Number::from_f64(f)
                .map(Value::Number)
                .unwrap_or(Value::Null),
            gray_matter::Pod::String(s) => Value::String(s),
            gray_matter::Pod::Array(arr) => {
                Value::Array(arr.into_iter().map(|p| self.pod_to_json_value(p)).collect())
            }
            gray_matter::Pod::Hash(map) => {
                let mut json_map = serde_json::Map::new();
                for (k, v) in map {
                    json_map.insert(k, self.pod_to_json_value(v));
                }
                Value::Object(json_map)
            }
        }
    }


    pub fn render(&self, content: &str) -> Result<String> {
        let mut options = Options::empty();
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_FOOTNOTES);
        options.insert(Options::ENABLE_TASKLISTS);

        if self.highlight_code {
            self.render_with_syntax_highlighting(content, options)
        } else {
            let parser = Parser::new_ext(content, options);
            let mut html_output = String::new();
            html::push_html(&mut html_output, parser);
            Ok(html_output)
        }
    }

    fn render_with_syntax_highlighting(&self, content: &str, options: Options) -> Result<String> {
        let parser = Parser::new_ext(content, options);
        let mut html_output = String::new();
        let mut code_block = None;
        let theme = &self.theme_set.themes["base16-ocean.dark"];

        let mut events = Vec::new();
        for event in parser {
            match event {
                pulldown_cmark::Event::Start(pulldown_cmark::Tag::CodeBlock(kind)) => {
                    if let CodeBlockKind::Fenced(lang) = &kind {
                        code_block = Some((String::new(), lang.to_string()));
                    }
                }
                pulldown_cmark::Event::Text(text) => {
                    if let Some((ref mut code, _)) = code_block {
                        code.push_str(&text);
                    } else {
                        events.push(pulldown_cmark::Event::Text(text));
                    }
                }
                pulldown_cmark::Event::End(pulldown_cmark::TagEnd::CodeBlock) => {
                    if let Some((code, lang)) = code_block.take() {
                        let highlighted = self.highlight_code_block(&code, &lang, theme);
                        events.push(pulldown_cmark::Event::Html(highlighted.into()));
                    }
                }
                _ => events.push(event),
            }
        }

        html::push_html(&mut html_output, events.into_iter());
        Ok(html_output)
    }

    fn highlight_code_block(&self, code: &str, lang: &str, theme: &syntect::highlighting::Theme) -> String {
        let syntax = self.syntax_set
            .find_syntax_by_token(lang)
            .unwrap_or_else(|| self.syntax_set.find_syntax_plain_text());

        let mut highlighter = syntect::easy::HighlightLines::new(syntax, theme);
        let mut output = String::from("<pre><code>");

        for line in code.lines() {
            let ranges = highlighter.highlight_line(line, &self.syntax_set).unwrap();
            let html_line = styled_line_to_highlighted_html(&ranges[..], IncludeBackground::No).unwrap();
            output.push_str(&html_line);
            output.push('\n');
        }

        output.push_str("</code></pre>");
        output
    }
}