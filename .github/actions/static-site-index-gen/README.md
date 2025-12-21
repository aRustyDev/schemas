# Static Site Index Generator

Generate `index.html` and `index.json` files for static sites served by Cloudflare Workers.

## Purpose

Creates navigable directory listings for file-based static sites. Perfect for:
- Schema registries (schemas.arusty.dev)
- Justfile libraries (just.arusty.dev)
- Documentation sites
- Any static file hosting

## Usage

```yaml
- uses: ./.github/actions/static-site-index-gen
  with:
    root: './dist'
    output-format: 'both'
    stylesheet: 'https://example.com/styles.css'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `root` | Root directory to scan | No | `.` |
| `output-format` | Output format: `html`, `json`, or `both` | No | `both` |
| `stylesheet` | URL to external stylesheet | No | (uses default dark theme) |
| `ignore` | Gitignore-style patterns to exclude | No | `node_modules`, `.git`, `.github`, `*.map`, `*.d.ts` |
| `include-metadata` | Include file sizes and dates | No | `true` |
| `title-template` | Template for page titles (`{path}` placeholder) | No | `Index of {path}` |
| `token` | GitHub token | No | `${{ github.token }}` |

## Outputs

| Output | Description |
|--------|-------------|
| `generated-count` | Number of index files generated |
| `directories-scanned` | Number of directories processed |
| `manifest-path` | Path to root manifest (if JSON enabled) |

## Examples

### Basic HTML + JSON

```yaml
name: Generate Indices
on:
  push:
    branches: [main]

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: ./.github/actions/static-site-index-gen
        with:
          root: './public'
          output-format: 'both'
```

### Custom Stylesheet

```yaml
- uses: ./.github/actions/static-site-index-gen
  with:
    root: './schemas'
    stylesheet: 'https://schemas.arusty.dev/style.css'
    title-template: 'Schema Registry - {path}'
```

### Selective Ignore Patterns

```yaml
- uses: ./.github/actions/static-site-index-gen
  with:
    root: '.'
    ignore: |
      node_modules
      .git
      .github
      *.test.js
      __tests__
      coverage
```

### JSON Only (for APIs)

```yaml
- uses: ./.github/actions/static-site-index-gen
  with:
    root: './api'
    output-format: 'json'
    include-metadata: 'true'
```

## Output Format

### HTML

Generates a clean, accessible directory listing with:
- File/folder icons
- File sizes and modification dates
- Parent directory navigation
- Dark theme by default (customizable via stylesheet)

### JSON

```json
{
  "path": "/schemas",
  "entries": [
    {
      "name": "frontmatter.schema.json",
      "type": "file",
      "size": 2048,
      "modified": "2024-01-15T10:30:00.000Z",
      "path": "schemas/frontmatter.schema.json"
    },
    {
      "name": "markdown",
      "type": "directory",
      "path": "schemas/markdown"
    }
  ],
  "generated": "2024-01-20T15:00:00.000Z"
}
```

## Development

```bash
cd .github/actions/static-site-index-gen
npm install
npm run build
npm test
```

## Local Testing

```yaml
# .github/workflows/test-index-gen.yml
name: Test Index Generator
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/static-site-index-gen
        with:
          root: './schemas'
```

## Integration with Cloudflare Workers

This action runs **before** deployment. Typical workflow:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Generate indices first
      - uses: ./.github/actions/static-site-index-gen
        with:
          root: './public'

      # Then deploy to Cloudflare
      - uses: cloudflare/wrangler-action@v3
        with:
          command: pages deploy public
```
