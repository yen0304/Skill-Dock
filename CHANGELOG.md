# Changelog

All notable changes to the Skill Dock extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/yen0304/Skill-Dock/releases/tag/v0.1.0
