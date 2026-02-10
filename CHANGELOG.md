# Changelog

All notable changes to the Skill Dock extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.2.0
[0.1.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.1.0
