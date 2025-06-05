# {{project.name}}

{{#if project.description}}
{{project.description}}
{{/if}}

## Overview

This project contains {{project.modules.length}} modules with a total of {{project.metrics.total_lines}} lines of code.

## Installation

```bash
cargo install {{project.name}}
```

## Usage

```bash
{{project.name}} --help
```

## Dependencies

{{#each project.dependencies}}
- `{{@key}}`: {{this}}
{{/each}}

## Project Structure

```
{{#each project.structure.directories}}
{{this.name}}/
{{/each}}
```

## API Documentation

{{#each project.modules}}
### {{this.name}}

{{#if this.docs}}
{{this.docs}}
{{/if}}

{{#if this.functions}}
**Functions:** {{this.functions.length}}
{{/if}}

{{#if this.structs}}
**Structs:** {{this.structs.length}}
{{/if}}

{{/each}}

## Metrics

- **Lines of Code:** {{project.metrics.total_lines}}
- **Total Files:** {{project.metrics.total_files}}
- **Test Files:** {{project.metrics.test_files}}
- **Dependencies:** {{project.metrics.dependency_count}}
- **Complexity Score:** {{project.metrics.complexity_score}}

## License

{{#if project.license}}
{{project.license}}
{{else}}
MIT
{{/if}}

## Authors

{{#each project.authors}}
- {{this}}
{{/each}}