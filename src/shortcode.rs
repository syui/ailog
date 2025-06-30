use regex::Regex;
use std::collections::HashMap;

pub struct ShortcodeProcessor {
    shortcodes: HashMap<String, Box<dyn Fn(&str) -> String + Send + Sync>>,
}

impl ShortcodeProcessor {
    pub fn new() -> Self {
        let mut processor = Self {
            shortcodes: HashMap::new(),
        };
        
        // Register built-in shortcodes
        processor.register_img_compare();
        
        processor
    }

    fn register_img_compare(&mut self) {
        self.shortcodes.insert(
            "img-compare".to_string(),
            Box::new(|attrs| Self::parse_img_compare_shortcode(attrs)),
        );
    }

    pub fn process(&self, content: &str) -> String {
        let mut processed = content.to_string();

        // Process {{< shortcode >}} format (Hugo-style)
        let hugo_regex = Regex::new(r#"\{\{\<\s*(\w+(?:-\w+)*)\s+([^>]*)\s*\>\}\}"#).unwrap();
        processed = hugo_regex.replace_all(&processed, |caps: &regex::Captures| {
            let shortcode_name = &caps[1];
            let attrs = &caps[2];
            
            if let Some(handler) = self.shortcodes.get(shortcode_name) {
                handler(attrs)
            } else {
                caps[0].to_string() // Return original if shortcode not found
            }
        }).to_string();

        // Process [shortcode] format (Bracket-style)
        let bracket_regex = Regex::new(r#"\[(\w+(?:-\w+)*)\s+([^\]]*)\]"#).unwrap();
        processed = bracket_regex.replace_all(&processed, |caps: &regex::Captures| {
            let shortcode_name = &caps[1];
            let attrs = &caps[2];
            
            if let Some(handler) = self.shortcodes.get(shortcode_name) {
                handler(attrs)
            } else {
                caps[0].to_string() // Return original if shortcode not found
            }
        }).to_string();

        processed
    }

    fn parse_attributes(attrs: &str) -> HashMap<String, String> {
        let attr_regex = Regex::new(r#"(\w+(?:-\w+)*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))"#).unwrap();
        let mut attributes = HashMap::new();

        for caps in attr_regex.captures_iter(attrs) {
            let key = caps.get(1).unwrap().as_str().to_string();
            let value = caps.get(2).or(caps.get(3)).or(caps.get(4)).unwrap().as_str().to_string();
            attributes.insert(key, value);
        }

        attributes
    }

    fn parse_img_compare_shortcode(attrs: &str) -> String {
        let attributes = Self::parse_attributes(attrs);

        let before = attributes.get("before").map(|s| s.as_str()).unwrap_or("");
        let after = attributes.get("after").map(|s| s.as_str()).unwrap_or("");
        let before_caption = attributes.get("before-caption")
            .or(attributes.get("before-alt"))
            .map(|s| s.as_str())
            .unwrap_or("Before");
        let after_caption = attributes.get("after-caption")
            .or(attributes.get("after-alt"))
            .map(|s| s.as_str())
            .unwrap_or("After");
        let width = attributes.get("width").map(|s| s.as_str()).unwrap_or("1000");
        let height = attributes.get("height").map(|s| s.as_str()).unwrap_or("400");
        let alt = attributes.get("alt").map(|s| s.as_str()).unwrap_or("");

        let alt_suffix = if !alt.is_empty() { 
            format!(" | {}", alt) 
        } else { 
            String::new() 
        };

        format!(r#"
<div class="img-comparison-container">
    <div class="img-comparison-slider" style="height: {}px;">
        <div class="img-before overlay-side">
            <img src="{}" alt="{}{}" loading="lazy" width="{}">
        </div>
        <div class="img-after">
            <img src="{}" alt="{}{}" loading="lazy" width="{}">
        </div>
        <input type="range" min="0" max="100" value="50" class="slider">
        <div class="slider-thumb">
            <div class="slider-thumb-img"></div>
        </div>
    </div>
</div>"#, 
            height, 
            before, before_caption, alt_suffix, width,
            after, after_caption, alt_suffix, width
        )
    }

    /// Register a custom shortcode handler
    #[allow(dead_code)]
    pub fn register_shortcode<F>(&mut self, name: &str, handler: F)
    where
        F: Fn(&str) -> String + Send + Sync + 'static,
    {
        self.shortcodes.insert(name.to_string(), Box::new(handler));
    }

    /// Get list of registered shortcodes
    #[allow(dead_code)]
    pub fn get_shortcode_names(&self) -> Vec<&String> {
        self.shortcodes.keys().collect()
    }
}

impl Default for ShortcodeProcessor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_img_compare_hugo_style() {
        let processor = ShortcodeProcessor::new();
        let input = r#"{{< img-compare before="/before.jpg" after="/after.jpg" >}}"#;
        let result = processor.process(input);
        
        assert!(result.contains("img-comparison-container"));
        assert!(result.contains("/before.jpg"));
        assert!(result.contains("/after.jpg"));
    }

    #[test]
    fn test_img_compare_bracket_style() {
        let processor = ShortcodeProcessor::new();
        let input = r#"[img-compare before="/before.jpg" after="/after.jpg"]"#;
        let result = processor.process(input);
        
        assert!(result.contains("img-comparison-container"));
        assert!(result.contains("/before.jpg"));
        assert!(result.contains("/after.jpg"));
    }

    #[test]
    fn test_custom_shortcode() {
        let mut processor = ShortcodeProcessor::new();
        processor.register_shortcode("test", |_| "<div>test</div>".to_string());
        
        let input = "{{< test >}}";
        let result = processor.process(input);
        
        assert_eq!(result, "<div>test</div>");
    }

    #[test]
    fn test_unknown_shortcode() {
        let processor = ShortcodeProcessor::new();
        let input = "{{< unknown attr=\"value\" >}}";
        let result = processor.process(input);
        
        assert_eq!(result, input); // Should return original
    }

    #[test]
    fn test_attribute_parsing() {
        let attributes = ShortcodeProcessor::parse_attributes(r#"before="/test.jpg" after='test2.jpg' width=800"#);
        
        assert_eq!(attributes.get("before").unwrap(), "/test.jpg");
        assert_eq!(attributes.get("after").unwrap(), "test2.jpg");
        assert_eq!(attributes.get("width").unwrap(), "800");
    }
}