# Changelog

## Recent Changes

{{#each commits}}
### {{this.date}}

**{{this.hash}}** by {{this.author}}

{{this.message}}

---

{{/each}}

## Summary

- **Total Commits:** {{commits.length}}
- **Contributors:** {{#unique commits "author"}}{{this.author}}{{#unless @last}}, {{/unless}}{{/unique}}