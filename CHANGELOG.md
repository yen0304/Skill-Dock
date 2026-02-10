# Changelog

All notable changes to the Skill Dock extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-02-11

### Added

- **GitHub Token authentication**: New `skilldock.githubToken` setting for GitHub API requests; increases rate limit from 60 to 5,000 requests per hour
- **Rate limit detection**: Friendly error message with configuration guidance when GitHub API rate limit is exceeded (HTTP 403)
- **Library sort**: New `skilldock.librarySortBy` setting and `Sort Library` command to sort by name (A-Z), last modified (newest first), or author (A-Z)
- **281 tests** with comprehensive coverage:
  - 14 new network layer tests for MarketplaceService (44% → 93% coverage)
  - 12 new command handler happy-path tests for extension.ts (59% → 89% coverage)
  - Expanded panel test coverage with message handler and HTML tests
- **Husky pre-commit hooks**: Runs `tsc --noEmit` and `vitest run` before every commit

### Fixed

- **installSkill double-serialization**: Marketplace skill install produced corrupted SKILL.md with duplicate frontmatter; now passes body directly to `createSkill`
- **Repo skill context menu**: `Edit Skill` and `Delete Skill` commands were shown on repo skill items but only operated on library paths; now restricted to library view only

### Changed

- **Zero `any` types in production code**: Replaced 7 `any` instances with proper interfaces (`GitTreeItem`, `GitTreeResponse`, `WebviewMessage`)
- **Async I/O**: Converted all `fs` operations to `fs/promises` for non-blocking file access
- **YAML package migration**: Replaced hand-written frontmatter parser with the `yaml` package for robust parsing
- Removed dead code: `_rebuildSkillMd()` method that was producing duplicate frontmatter

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

[0.4.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.4.0
[0.3.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.3.0
[0.2.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.2.0
[0.1.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.1.0
