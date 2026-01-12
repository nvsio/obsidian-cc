# Obsidian CC

<div align="center">

**The Ultimate Obsidian Companion**

Claude AI + QMD Semantic Search + Project Management + GitHub Workflows

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.5.0+-purple.svg)](https://obsidian.md)

</div>

> ⚠️ **EXPERIMENTAL** - This plugin is in early development. Expect bugs and breaking changes. Use at your own risk.

---

## Installation

### Option 1: Download (Easiest)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/nvsio/obsidian-cc/releases)
2. Create folder: `YourVault/.obsidian/plugins/obsidian-cc/`
3. Copy the 3 files into that folder
4. Restart Obsidian
5. Settings → Community Plugins → Enable "Obsidian CC"

### Option 2: Clone (For Development)

```bash
cd /path/to/your/vault/.obsidian/plugins
git clone https://github.com/nvsio/obsidian-cc.git
cd obsidian-cc
npm install && npm run build
```

---

## Setup

1. **Add your API key**: Settings → Obsidian CC → Anthropic API Key (`sk-ant-...`)

2. **Use it**: Type `@claude` in any note → select action from dropdown → Enter

---

## Why Obsidian CC?

Obsidian CC bridges the gap between your knowledge vault and AI-powered workflows. Unlike other AI plugins, Obsidian CC:

- **Dual @ Mention System** - Quick inline completions (`@claude`) vs full agentic sessions (`@cc`)
- **QMD Integration** - Local semantic search by [Tobi Lütke](https://github.com/tobi/qmd) - your data never leaves your machine
- **Claude Code Native** - Built-in MCP server for seamless Claude Code/Desktop integration
- **Tasks-Aware** - AI understands and manages your Obsidian Tasks
- **Security-First** - API keys in system keychain, never plaintext

---

## Features

### Dual @ Mention System

#### `@claude [command]` - Quick Inline Mode

Type a trigger, press **Tab**, and the response replaces it inline. Notion-style magic.

| Command | Description |
|---------|-------------|
| `@claude summarize` | Condense text into key points |
| `@claude expand` | Add depth and detail |
| `@claude rewrite` | Improve clarity and flow |
| `@claude explain` | Simplify complex content |
| `@claude translate [lang]` | Translate to any language |
| `@claude fix` | Fix grammar and spelling |
| `@claude bullets` | Convert to bullet points |
| `@claude table` | Convert to markdown table |
| `@claude continue` | Continue writing |

#### `@cc` - Terminal Mode

Launches Claude CLI in your terminal with the full note as context:
- **Auto-install** - If Claude CLI isn't installed, offers one-click install
- **Full Context** - Entire note passed to Claude CLI
- **Native Terminal** - Works with Terminal.app (macOS), cmd (Windows), or common Linux terminals
- **Vault-Aware** - Opens terminal in your vault directory

Just type `@cc` → select from dropdown → Claude CLI opens with your note ready

---

### QMD Semantic Search

Integrates with [QMD](https://github.com/tobi/qmd) - Tobi Lütke's local semantic search engine:

- **Hybrid Search** - Combines keyword + semantic for best results
- **Privacy-First** - All processing on your machine
- **Automatic Indexing** - Vault indexed on plugin load
- **Context Injection** - Claude can search relevant notes via MCP

---

### Claude Code Integration

Seamless integration with [Claude CLI](https://docs.anthropic.com/en/docs/claude-code):

- **`@cc` Trigger** - Type `@cc` in any note to launch terminal with full note context
- **Auto-Install** - If Claude CLI isn't installed, one-click install via npm
- **MCP Server** - Exposes vault tools via Model Context Protocol
- **Bi-directional** - Read notes from CLI, write notes from Obsidian

```bash
# From terminal, Claude Code can access your vault via MCP
claude "Search my vault for notes about project architecture"

# Or from Obsidian, type @cc to launch Claude with your note
```

---

### Tasks Integration

Works with [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks):

- AI reads and writes task format
- Project analysis and sprint planning
- Progress tracking with insights

---

### GitHub Workflow

Clone repos and get AI-powered project setup:

```
CC: New Project from GitHub
> https://github.com/username/repo

Creating project notes...
- Architecture overview
- Key files analysis
- Onboarding checklist
- QMD collection setup
```

---

## Installation

### From Community Plugins

1. Open **Settings** > **Community Plugins** > **Browse**
2. Search for "Obsidian CC"
3. Click **Install**, then **Enable**

### Manual Installation

```bash
# Download latest release
curl -L https://github.com/YOUR_USERNAME/obsidian-cc/releases/latest/download/obsidian-cc.zip -o obsidian-cc.zip

# Extract to plugins folder
unzip obsidian-cc.zip -d YOUR_VAULT/.obsidian/plugins/obsidian-cc
```

### Prerequisites

- **QMD** (optional but recommended):
  ```bash
  bun install -g https://github.com/tobi/qmd
  ```

---

## Configuration

### API Keys

Your Anthropic API key is stored securely in your system's keychain:
- **macOS**: Keychain Access
- **Windows**: Credential Manager
- **Linux**: libsecret (GNOME Keyring)

Or use environment variable: `ANTHROPIC_API_KEY`

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Inline trigger | `@claude` | Pattern for quick completions |
| Agentic trigger | `@cc` | Pattern to launch Claude CLI |
| QMD enabled | `true` | Enable semantic search |
| Tasks integration | `true` | AI can manage tasks |
| MCP server | `true` | Enable Claude Code access |
| Require approval | `true` | Ask before file writes |

---

## Security

Obsidian CC is built security-first:

- **No Plaintext Secrets** - API keys encrypted via OS keychain
- **Path Validation** - Prevents directory traversal attacks
- **Input Sanitization** - DOMPurify for all rendered content
- **Permission System** - Explicit approval for file operations
- **Audit Logging** - Optional operation logging
- **Network Allowlist** - Only connects to api.anthropic.com

---

## Commands

| Command | Hotkey | Description |
|---------|--------|-------------|
| `CC: Quick Ask` | - | Single prompt, inline response |
| `CC: Start Session` | - | Open agentic sidebar |
| `CC: Search Vault` | - | QMD semantic search |
| `CC: New Project from GitHub` | - | Clone + AI setup |
| `CC: Analyze Project` | - | Generate project overview |

---

## Development

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/obsidian-cc.git
cd obsidian-cc

# Install
npm install

# Development (watch mode)
npm run dev

# Production build
npm run build

# Test
npm test

# Lint
npm run lint
```

### Project Structure

```
obsidian-cc/
├── src/
│   ├── main.ts              # Plugin entry
│   ├── core/
│   │   ├── api/             # Claude API wrapper
│   │   ├── inline/          # @claude trigger system
│   │   ├── cli/             # Claude CLI integration (@cc)
│   │   ├── security/        # Keychain, sanitization
│   │   ├── qmd/             # QMD integration
│   │   └── mcp/             # MCP server
│   ├── settings/            # Settings UI
│   └── ui/                  # Modals (QuickAsk, Search)
├── manifest.json
└── package.json
```

---

## Credits

- [QMD](https://github.com/tobi/qmd) by Tobi Lütke
- [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks)
- [Claude](https://anthropic.com) by Anthropic
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

## License

MIT - See [LICENSE](LICENSE)

---

<div align="center">

**Built for power users who live in Obsidian**

[Report Bug](https://github.com/YOUR_USERNAME/obsidian-cc/issues) · [Request Feature](https://github.com/YOUR_USERNAME/obsidian-cc/issues)

</div>
