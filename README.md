# Skill Dock

> Local-first agent skill manager for VS Code / Cursor.

[![CI](https://github.com/yen0304/Skill-Dock/actions/workflows/ci.yml/badge.svg)](https://github.com/yen0304/Skill-Dock/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/yen0304/Skill-Dock/branch/main/graph/badge.svg)](https://codecov.io/gh/yen0304/Skill-Dock)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/skill-dock.skill-dock?label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=skill-dock.skill-dock)

Browse, create, edit, delete, and import agent skills across any project — supporting multiple AI assistant formats.

## Quick Install

[![Install in VS Code](https://img.shields.io/badge/Install%20in-VS%20Code-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=skill-dock.skill-dock)

Or search **"Skill Dock"** in the VS Code Extensions panel (`Ctrl+Shift+X`).

**Install from command line:**

```bash
code --install-extension skill-dock.skill-dock
```

---

## Features

### Skill Library

Skills are stored locally on your machine (`~/.skilldock/skills/` by default).  
Full CRUD operations: create, view, edit, delete, duplicate, and search.

### Sidebar Browser

- **Skill Library** panel — browse all locally stored skills
- **Repo Skills** panel — view skills already in the current project, grouped by format
- **Skill Marketplace** panel — browse marketplace sources; click to open filtered marketplace

### Agent Skill Marketplace

Browse and install agent skills from GitHub repositories:

- **Built-in sources**: Anthropic Skills, OpenAI Skills, GitHub Awesome Copilot Skills
- **Custom sources**: Add any GitHub repo URL as a skill source
- **In-panel preview**: Click a skill to see its full rendered content
- **Source filters**: Multi-select chips with Select All / Deselect All toggle
- **One-click install**: Install skills directly to your local library

### Manager Dashboard

A full-featured webview panel for managing your skill library with search, import, and delete capabilities.

### Import to Any Repo

Import skills from your library into the current workspace. Choose the target format:

| Format | Directory | Description |
|--------|-----------|-------------|
| Claude | `.claude/skills/` | Claude Code / Claude Desktop |
| Cursor | `.cursor/skills/` | Cursor IDE |
| Codex | `.codex/skills/` | OpenAI Codex (with scaffold dirs) |
| GitHub | `.github/skills/` | GitHub-based format |

Multi-select import supported. Save repo skills back to your library.

### Skill Editor

Visual form-based editor for creating and editing skills — metadata fields (name, description, author, version, license, tags) and Markdown body.

### Multi-Language Support

| Language | Code |
|----------|------|
| English | `en` (default) |
| 繁體中文 | `zh-tw` |
| 日本語 | `ja` |

Follows your VS Code display language automatically.

---

## Commands

All commands are available via `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) under the **Skill Dock** category.

| Command | Description |
|---------|-------------|
| `Skill Dock: Create New Skill` | Create a new skill in your library |
| `Skill Dock: Edit Skill` | Edit an existing skill |
| `Skill Dock: Delete Skill` | Delete a skill from library |
| `Skill Dock: View Skill` | Open SKILL.md in the editor |
| `Skill Dock: Import Skill to Repo` | Import skill(s) to the current project |
| `Skill Dock: Save Skill to Library` | Save a repo skill to your local library |
| `Skill Dock: Duplicate Skill` | Duplicate a skill as a template |
| `Skill Dock: Search Skills` | Search skills by keyword |
| `Skill Dock: Open Skill Manager` | Open the manager dashboard |
| `Skill Dock: Open Library Folder` | Reveal library folder in OS file manager |
| `Skill Dock: Open Skill Marketplace` | Browse and install skills from GitHub |
| `Skill Dock: Add Marketplace Source` | Add a custom GitHub repository as a skill source |
| `Skill Dock: Remove Marketplace Source` | Remove a custom marketplace source |
| `Skill Dock: Add to Library` | Save a repo skill to your library (inline button) |
| `Skill Dock: Sort Library` | Change library sort order (name / last modified / author) |

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `skilldock.libraryPath` | `~/.skilldock/skills` | Custom path for the skill library |
| `skilldock.defaultTarget` | `claude` | Default target format when importing |
| `skilldock.showRepoSkills` | `true` | Show the Repo Skills panel |
| `skilldock.marketplaceSources` | `[]` | Custom marketplace source URLs |
| `skilldock.githubToken` | `""` | GitHub personal access token (raises rate limit to 5,000/hr) |
| `skilldock.librarySortBy` | `"name"` | Library sort order: `name`, `lastModified`, or `author` |

---

## Skill Format

Skills use the `SKILL.md` convention with YAML frontmatter:

```markdown
---
name: my-skill
description: What this skill does and when to use it.
author: your-name
version: "1.0"
license: MIT
tags:
  - coding
  - review
---

# My Skill

Instructions and workflow content here...
```

---

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Format
npm run format

# Package
npm run package
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines.

---

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before getting started.

## Security

For security concerns, please see our [Security Policy](SECURITY.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes.

## License

[MIT](LICENSE) © Skill Dock Contributors
