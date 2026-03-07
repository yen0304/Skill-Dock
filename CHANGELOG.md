# Changelog

All notable changes to the Skill Dock extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-03-07

### Added

- **Recursive folder support in Skill Library**: Skills containing subdirectories now display a proper nested tree structure. Folders are collapsible with `SkillFolderItem` nodes; files within subdirectories are correctly resolved with relative paths.
- **Recursive folder support in Repo Skills**: `RepoSkillsProvider` now scans subdirectories recursively and displays expandable folder/file tree — matching the same behavior as the Skill Library.
- **Shared tree builder**: `SkillLibraryProvider.buildChildEntries()` is now a public static method shared by both Library and Repo Skills providers, eliminating code duplication.
- **SVG icons in Marketplace**: All emoji icons in the Marketplace panel replaced with inline SVG icons (package, cart, refresh, warning, star, folder, paperclip, chart, user, license, file, gear, edit). SVGs use `stroke="currentColor"` for seamless theme integration.
- **Preview panel folder tree**: Skill Preview Panel sidebar now renders nested folders with collapsible toggles, matching the tree view structure.
- **Multi-language README**: Added `README.ja.md` (Japanese), `README.zh-tw.md` (Traditional Chinese), and `README.zh-cn.md` (Simplified Chinese) alongside the existing English `README.md`.
- **Simplified Chinese localization**: Added `l10n/bundle.l10n.zh-cn.json` and `package.nls.zh-cn.json` — full Simplified Chinese (zh-cn) UI translation for all extension strings.
- **11 new tests** covering recursive `additionalFiles` scanning (storageService), `SkillFolderItem` creation/properties, deeply nested folder expansion (skillLibraryProvider), and repo skills folder expansion (repoSkillsProvider). Total: 443 tests.

### Changed

- `StorageService.readSkill()` now uses `readdir({ withFileTypes: true })` with recursive scanning. `additionalFiles` contains relative paths with trailing `/` for directories (e.g., `scripts/`, `scripts/helper.sh`).
- `SkillFileItem` constructor now accepts a 4th `relativePath` parameter for proper nested file resolution.
- `SkillLibraryProvider.getChildren()` handles `SkillFolderItem` expansion in addition to `SkillTreeItem` and `SkillFileItem`.
- `RepoSkillsProvider.scanSkillsDir()` now collects `additionalFiles` recursively, matching the same logic as `StorageService`.
- `LibraryTreeItem` union type expanded to include `SkillFolderItem`.

## [0.7.0] - 2026-03-07

### Added

- **skills.sh ecosystem integration**: New "skills.sh" tab in the Agent Skill Marketplace lets you search and install skills from the entire [skills.sh](https://skills.sh) ecosystem — the same registry used by `npx skills`. Discover thousands of community-contributed agent skills directly from VS Code.
- **`SkillsRegistryService`**: New service (`src/services/skillsRegistryService.ts`) wrapping the skills.sh search API. Supports fuzzy search, formatted install counts, and one-click install to your local library via the existing marketplace pipeline.
- **Tabbed marketplace UI**: Marketplace panel now features a two-tab layout — "📦 Sources" (existing GitHub source browsing) and "▲ skills.sh" (ecosystem-wide search). Tabs preserve state when switching.
- **Builtin sources expanded**: Added `vercel-labs/skills` (Vercel Skills) and `vercel-labs/agent-skills` (Vercel Agent Skills) as built-in marketplace sources, bringing the total to 5.
- **Expandable skill tree**: Skill Library tree items now expand to show all files within the skill directory (SKILL.md + additional files). Click any file to open it directly in the editor.
- **Skill Preview Panel**: New rich webview panel for previewing skills from the library. Shows rendered Markdown content, metadata, tags, and a file sidebar for browsing additional files. Includes "Edit Skill" and "Import to Repo" action buttons.
- **Localization**: Japanese (ja) and Traditional Chinese (zh-tw) translations for all new skills.sh UI strings.

### Changed

- `MarketplacePanel.createOrShow()` now accepts an optional `SkillsRegistryService` parameter for registry search integration.
- Marketplace detail view now hides/restores the tab bar when entering/leaving skill preview.

## [0.6.2] - 2026-03-05

### Changed

- **Tarball-based fetching**: Marketplace now downloads each source as a single tar.gz archive via `codeload.github.com` instead of making individual HTTP requests per file. This reduces 256+ network calls to just 3 (one per built-in source) and dramatically improves load speed.
- **Skill detail preview**: Marketplace preview now shows bundled file list with per-file icons, inline file preview with Markdown rendering and syntax highlighting for code files.
- **Source filtering**: Marketplace toolbar now includes a source filter dropdown to show skills from a specific source.
- **Error handling**: Added 60-second load timeout, `loadError` state in webview, and toast notifications for install/update/preview failures.

### Fixed

- **Webview SyntaxError**: Fixed `'\n'` inside a template literal being evaluated to a real newline, which broke the entire webview script and caused the marketplace to spin forever on "Loading...".

## [0.6.1] - 2026-03-03

### Added

- **Additional-files badge**: Manager and Marketplace skill cards now display a file-count badge when a skill bundles extra files.
- **Bundled-files detail section**: The Marketplace preview detail view renders a "Bundled Files" list with per-file icons (gear for scripts, page for documents).
- **Tooltip enhancement**: Library tree-item tooltips now list `additionalFiles` when present.
- **4 new tests** covering `additionalFiles` tooltip rendering, `additionalFiles` passthrough in Manager, `additionalFilesCount` in Marketplace ready, and `additionalFiles` in Marketplace preview (356 → 360 total).

### Changed

- Test coverage maintained at 90 %+: Statements 97.6 %, Branch 91.5 %, Functions 96.0 %, Lines 98.1 %.

## [0.6.0] - 2026-03-03

### Added

- **Additional files support**: Marketplace skills can now bundle extra files such as reference documents, scripts, and templates alongside `SKILL.md`. These sibling files are automatically downloaded and saved to the skill directory during install and update.
- **`RemoteAdditionalFile` model**: New interface for representing supplementary files discovered in remote skill repositories.
- **`StorageService.writeSkillFile()`**: New method to write additional files into a skill's directory, creating intermediate subdirectories as needed.
- **31 new tests** covering token migration, command handlers (setGithubToken, clearGithubToken, sortLibrary, duplicateSkill, error paths), validateInput callbacks, panel double-dispose guards, nested directory copy, and more (325 → 356 total).

### Changed

- **Test coverage raised to 90 %+** across all metrics: Statements 97.6 %, Branch 91.4 %, Functions 96.0 %, Lines 98.1 %.
- `_fetchSkillMd()` now receives the full file tree so it can detect sibling files in the same skill directory.
- `installSkill()` and `updateSkillSilently()` now download additional files after saving `SKILL.md`.

## [0.5.1] - 2026-02-28

### Fixed

- **Dash placeholder crash**: Frontmatter fields with bare `-` values (e.g. `author: -`) no longer cause a YAML parse error that resets all metadata to "untitled". The parser now safely quotes bare dashes before parsing and treats `-` as "not specified".

## [0.5.0] - 2026-02-24

### Added

- **Secure GitHub Token**: GitHub personal access token is now stored in VS Code's encrypted `SecretStorage` instead of plaintext settings. Use the new `Set GitHub Token` command to store your token securely. Existing tokens in settings are automatically migrated on first launch.
- **Install statistics**: Tracks how many times each skill has been installed from the marketplace. The install count and timestamp are stored in `.stats.json` inside your library folder (not in SKILL.md). The count is shown in the skill tooltip in the library tree view.
- **Version update notifications**: The marketplace now detects when an installed skill has a newer version available and shows a `↑ Update` button. Clicking it updates the skill silently (no confirmation dialog) and refreshes the button state.
- **`Most Used` sort order**: New sort option in `Sort Library` — sorts skills by install count (descending), with name as tie-breaker.
- **New commands**: `Set GitHub Token` (password input, saves securely) and `Clear GitHub Token`
- **16 new tests** covering install stats, version map, silent update, and token resolution (281 → 297 total)

### Changed

- `skilldock.githubToken` setting **removed** — use the `Set GitHub Token` command instead. Tokens stored in the old setting are automatically migrated to SecretStorage on activation and the setting is cleared.
- Rate limit error message updated to reference the new `Set GitHub Token` command instead of the removed settings path.
- Library sort now accepts `mostUsed` as a valid value for `skilldock.librarySortBy`.

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

[0.8.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.8.0
[0.7.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.7.0
[0.6.2]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.6.2
[0.6.1]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.6.1
[0.6.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.6.0
[0.5.1]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.5.1
[0.5.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.5.0
[0.4.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.4.0
[0.3.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.3.0
[0.2.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.2.0
[0.1.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.1.0
