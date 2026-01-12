# Obsidian CC

**Claude AI integration for Obsidian**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.5.0+-purple.svg)](https://obsidian.md)

> **EXPERIMENTAL** - Early development. Expect bugs.

---

## Installation

```bash
cd /path/to/your/vault/.obsidian/plugins
git clone https://github.com/nvsio/obsidian-cc.git
cd obsidian-cc
npm install && npm run build
```

Then: Settings → Community Plugins → Enable "Obsidian CC"

---

## Setup

1. Settings → Obsidian CC → Add your Anthropic API Key (`sk-ant-...`)
2. Type `@claude` in any note to start

---

## Features

### `@claude` - Inline AI

Type `@claude` anywhere in a note. A dropdown appears with quick commands:

| Command | What it does |
|---------|--------------|
| `/summarize` | Condense text above into key points |
| `/expand` | Add more detail and depth |
| `/rewrite` | Improve clarity and flow |
| `/fix` | Fix grammar and spelling |
| `/bullets` | Convert to bullet points |
| `/explain` | Simplify in plain terms |
| `/continue` | Continue writing |

Or type any custom prompt after `@claude` (e.g., `@claude make this more formal`).

Select an option and press Enter. The response replaces the trigger inline.

---

### `@cc` - Launch Claude CLI

Type `@cc` to open Claude CLI in your terminal with the full note as context.

- If Claude CLI isn't installed, shows "Install Claude CLI" option
- If installed, shows "Open in Claude CLI"
- Opens Terminal.app (macOS), cmd (Windows), or common Linux terminals
- Note content is passed to Claude CLI automatically

---

### `@qmd` - Semantic Search

Type `@qmd` to open semantic search powered by [QMD](https://github.com/tobi/qmd).

- Searches by meaning, not just keywords
- Shows relevance scores
- Click results to open notes
- Scope: search vault or home directory (configurable)

Also accessible via `Cmd+Shift+F` hotkey.

If QMD not found, click "Install QMD" to open terminal with install command.

---

### Quick Ask

Press `Cmd+J` to open a quick ask modal. Type a question, get an answer.

---

### MCP Server

Enable the MCP server in settings to let Claude Code access your vault:

```json
// .mcp.json in your vault
{
  "mcpServers": {
    "obsidian-cc": {
      "type": "http",
      "url": "http://localhost:3333/mcp"
    }
  }
}
```

Tools available via MCP:
- `read_note` - Read note content
- `write_note` - Create/update notes
- `search_notes` - Search vault
- `list_notes` - List notes in folder
- `get_tasks` - Get Obsidian Tasks

---

## Commands

| Command | Hotkey | Description |
|---------|--------|-------------|
| Execute Trigger | `Cmd+Shift+E` | Run @claude/@cc on current line |
| Quick Ask | `Cmd+J` | Open quick ask modal |
| Semantic Search | `Cmd+Shift+F` | QMD search modal |
| Start Chat Session | - | Open chat sidebar |

---

## Development

```bash
npm install
npm run dev    # Watch mode
npm run build  # Production
```

---

## License

MIT
