# Project Structure

## Directory Overview

```
{{#each structure.directories}}
{{this.name}}/
{{#each this.subdirectories}}
├── {{this}}/
{{/each}}
{{#if this.file_count}}
└── ({{this.file_count}} files)
{{/if}}

{{/each}}
```

## File Distribution

{{#each structure.files}}
- **{{this.name}}** ({{this.language}}) - {{this.lines_of_code}} lines{{#if this.is_test}} [TEST]{{/if}}
{{/each}}

## Statistics

- **Total Directories:** {{structure.directories.length}}
- **Total Files:** {{structure.files.length}}
- **Languages Used:**
{{#group structure.files by="language"}}
  - {{@key}}: {{this.length}} files
{{/group}}

{{#if structure.dependency_graph}}
## Dependencies

{{#each structure.dependency_graph}}
- **{{@key}}** depends on: {{#each this}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}
{{/if}}