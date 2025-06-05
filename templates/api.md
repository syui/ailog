# API Documentation

## Public Functions

{{#each api.public_functions}}
### `{{this.name}}`

{{#if this.docs}}
{{this.docs}}
{{/if}}

**Visibility:** `{{this.visibility}}`
{{#if this.is_async}}**Async:** Yes{{/if}}

{{#if this.parameters}}
**Parameters:**
{{#each this.parameters}}
- `{{this.name}}`: `{{this.param_type}}`{{#if this.is_mutable}} (mutable){{/if}}
{{/each}}
{{/if}}

{{#if this.return_type}}
**Returns:** `{{this.return_type}}`
{{/if}}

---

{{/each}}

## Public Structs

{{#each api.public_structs}}
### `{{this.name}}`

{{#if this.docs}}
{{this.docs}}
{{/if}}

**Visibility:** `{{this.visibility}}`

{{#if this.fields}}
**Fields:**
{{#each this.fields}}
- `{{this.name}}`: `{{this.field_type}}` ({{this.visibility}})
{{#if this.docs}}  - {{this.docs}}{{/if}}
{{/each}}
{{/if}}

---

{{/each}}

## Public Enums

{{#each api.public_enums}}
### `{{this.name}}`

{{#if this.docs}}
{{this.docs}}
{{/if}}

**Visibility:** `{{this.visibility}}`

{{#if this.variants}}
**Variants:**
{{#each this.variants}}
- `{{this.name}}`
{{#if this.docs}}  - {{this.docs}}{{/if}}
{{#if this.fields}}
  **Fields:**
{{#each this.fields}}
  - `{{this.name}}`: `{{this.field_type}}`
{{/each}}
{{/if}}
{{/each}}
{{/if}}

---

{{/each}}

## Public Traits

{{#each api.public_traits}}
### `{{this.name}}`

{{#if this.docs}}
{{this.docs}}
{{/if}}

**Visibility:** `{{this.visibility}}`

{{#if this.methods}}
**Methods:**
{{#each this.methods}}
- `{{this.name}}({{#each this.parameters}}{{this.name}}: {{this.param_type}}{{#unless @last}}, {{/unless}}{{/each}}){{#if this.return_type}} -> {{this.return_type}}{{/if}}`
{{#if this.docs}}  - {{this.docs}}{{/if}}
{{/each}}
{{/if}}

---

{{/each}}