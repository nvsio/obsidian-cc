---
description: Search your Obsidian vault semantically using QMD. Finds notes by meaning, not just keywords. Supports hybrid, semantic, and keyword modes.
---

# Obsidian Semantic Search

Search the user's Obsidian vault using QMD semantic search via the Obsidian CC MCP server.

## Arguments

- `query` (required): Natural language search query
- `mode` (optional): 'hybrid' (best), 'semantic' (meaning), 'keyword' (exact). Default: hybrid
- `limit` (optional): Maximum results (default: 10)

## Process

1. **Execute search**: Call the obsidian MCP server's `search_vault` tool with:
   - `query`: The search query
   - `mode`: Search mode
   - `limit`: Number of results

2. **Format results**: Display each result with:
   - Note title and path
   - Relevance score
   - Content snippet
   - Obsidian URI link

## Search Modes

- **Hybrid** (recommended): Combines semantic understanding with keyword matching
- **Semantic**: Uses vector embeddings to find conceptually similar content
- **Keyword**: Traditional text search for exact matches

## Output Format

```
## Search Results for: "<query>"
*Mode: <mode> | Found: <count> results*

### 1. **<Note Title>** (Score: <relevance>)
Path: `<file_path>`
[Open in Obsidian](obsidian://open?vault=Obsidian%20Vault&file=<encoded_path>)

> <content_snippet>...

---
```

## Example

User: `/obsidian-search query="machine learning project ideas" mode="semantic" limit=5`

Finds notes about ML projects, AI ideas, deep learning - even without exact phrase matches.

## Error Handling

- If QMD not installed: Provide installation instructions (`bun install -g https://github.com/tobi/qmd`)
- If vault not indexed: Suggest running indexing command
- If no results: Suggest alternative search terms or try different mode
