# Changelog

All notable changes to the Skill Dock extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-02-10

### Added

- **Agent Skill Marketplace**: Browse and install skills from GitHub repositories
  - Built-in sources: Anthropic Skills, OpenAI Skills, GitHub Awesome Copilot Skills
  - Add custom GitHub repository sources
  - Skill caching with 5-minute TTL for fast browsing
  - Multi-select source filter with **Select All / Deselect All** toggle
- **Marketplace Sidebar**: Independent tree view listing all marketplace sources; click a source to open the marketplace filtered to that source
- **In-panel Skill Preview**: Click a marketplace skill to view its full rendered content (Markdown → HTML) without opening a new file
- **Add to Library button**: Inline `$(library)` icon on each Repo Skill item for one-click save to library
- **Duplicate handling**: Overwrite / Keep Both / Skip dialog when importing a skill that already exists in your library (drag-and-drop & Add to Library)
- **New sidebar icon**: Hexagonal badge with lightning bolt and dock platform
- **19 new marketplace tests** (80 total)

### Fixed

- **Skill Editor broken for complex body content**: `</script>` inside skill body (e.g., p5.js CDN references) broke the editor webview by prematurely terminating the `<script>` block; fixed with proper escape
- **Cross-tree drag-and-drop MIME type**: Changed MIME from custom `skilldockrepo` to VS Code recommended `application/vnd.code.tree.skilldock.reposkills`; use `asString()` for reliable cross-tree data transfer

### Changed

- Marketplace preview now renders inline (no new untitled file)
- Source filter chips now include a quick toggle-all button

## [0.2.0] - 2026-02-10

### Fixed

- **Create Skill button not responding**: CSP (Content Security Policy) blocked inline `onclick` handlers in webview panels; replaced with `addEventListener` for both Skill Editor and Manager Dashboard
- **Manager Dashboard buttons not responding**: Same CSP inline handler issue in the Manager panel's dynamically generated skill list
- **YAML parser empty value bug**: Empty YAML fields (e.g., `description:`) were incorrectly parsed as `{}` instead of empty string `''`
- **YAML parser tags nesting bug**: Top-level `tags:` list was incorrectly nested inside an object instead of being parsed as a flat array
- **Validation regex for Skill ID**: Single-character IDs bypassed validation due to `&& id.length > 1` guard; fixed regex to `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`
- **Double dispose in webview panels**: Added `_disposed` guard flag to prevent `dispose()` from being called twice in both Skill Editor and Manager panels

### Added

- **Unit test suite**: 61 tests covering skill parser, storage service, editor validation, CSP compliance, and dispose safety (using Vitest)
- **Test coverage reporting**: Integrated Codecov with CI pipeline
- **CI test step**: Tests now run automatically on every push and pull request

## [0.1.0] - 2026-02-10

### Added

- **Skill Library**: Local skill storage at `~/.skilldock/skills/` with full CRUD operations
- **Sidebar Browser**: Tree view panels for both library skills and repo skills
- **Skill Editor**: Webview form for creating and editing skills with metadata
- **Manager Dashboard**: Full-featured webview panel with search, import, and delete
- **Import to Repo**: Import skills from library to workspace with format selection
  - Claude (`.claude/skills/`)
  - Cursor (`.cursor/skills/`)
  - Codex (`.codex/skills/`)
  - GitHub (`.github/skills/`)
- **Export to Library**: Save repo skills back to your local library
- **Search**: Filter skills by name, description, tags, or content
- **Duplicate**: Clone existing skills as templates
- **i18n**: Multi-language support (English, Traditional Chinese, Japanese)
- **Auto-detection**: Automatically scan and display skills in opened repositories

[0.3.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.3.0
[0.2.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.2.0
[0.1.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.1.0
