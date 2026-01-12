---
description: Create, update, or append to notes in your Obsidian vault. Supports markdown content with tags and Obsidian URI links.
---

# Obsidian Note Management

Create or update notes in the user's Obsidian vault using the Obsidian CC MCP server.

## Arguments

- `title` (required): The title/filename of the note (without .md extension)
- `content` (optional): The markdown content to write
- `mode` (optional): 'create' (new only), 'replace' (overwrite), 'append'. Default: create
- `tags` (optional): Comma-separated list of tags
- `folder` (optional): Subfolder path within the vault

## Process

1. **Build the path**: Combine folder (if provided) with title, add .md extension
2. **Format content**: If tags provided, add them as inline tags at the top (`#tag1 #tag2`)
3. **Call MCP tool**: Use the obsidian MCP server's `write_note` tool with:
   - `path`: The full path (e.g., "Projects/my-note.md")
   - `content`: The formatted markdown content
   - `mode`: create, replace, or append

4. **Return Obsidian URI**: After success, provide a clickable link:
   ```
   obsidian://open?vault=Obsidian%20Vault&file=<encoded_path>
   ```

## Example

User: `/obsidian-note title="2025-01-11 Meeting Notes" content="## Attendees\n- Alice\n- Bob" tags="meeting,work" folder="Work"`

Creates `Work/2025-01-11 Meeting Notes.md` with content:
```markdown
#meeting #work

## Attendees
- Alice
- Bob
```

## Error Handling

- If MCP server unavailable: "Please ensure Obsidian is running with Obsidian CC plugin enabled"
- If note exists in 'create' mode: Ask if user wants 'replace' or 'append' instead
- Always validate paths don't contain `..` or absolute paths
