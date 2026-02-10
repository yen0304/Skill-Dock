# Contributing to Skill Dock

Thank you for your interest in contributing to Skill Dock! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/Skill-Dock.git`
   (upstream: `https://github.com/yen0304/Skill-Dock.git`)
3. Create a feature branch: `git checkout -b feat/my-feature`
4. Make your changes
5. Push and open a Pull Request

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [VS Code](https://code.visualstudio.com/) >= 1.85.0
- npm >= 9

### Install & Build

```bash
cd skilldock-vscode
npm install
npm run compile
```

### Development Workflow

```bash
# Watch mode (auto-recompile on changes)
npm run watch

# Run linter
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format code
npm run format

# Package as .vsix
npm run package
```

### Testing Locally

1. Open `skilldock-vscode/` in VS Code
2. Press `F5` to launch the Extension Development Host
3. The extension will be active in the new window

## Making Changes

### Project Structure

```
src/
├── extension.ts              # Entry point, command registration
├── models/skill.ts           # Data models & target format definitions
├── utils/skillParser.ts      # SKILL.md frontmatter parser/serializer
├── services/
│   ├── storageService.ts     # Local CRUD operations
│   └── importExportService.ts # Import/export to repos
├── providers/
│   ├── skillLibraryProvider.ts   # Sidebar tree view (library)
│   └── repoSkillsProvider.ts    # Sidebar tree view (repo)
└── views/
    ├── skillEditorPanel.ts   # Webview: skill editor form
    └── managerPanel.ts       # Webview: manager dashboard
```

### Adding a New Target Format

1. Add the format to `TARGET_FORMATS` in `src/models/skill.ts`
2. Update the `TargetFormat` type union
3. Add i18n strings if needed

### Adding a New Language

1. Create `package.nls.<locale>.json` (for package.json strings)
2. Create `l10n/bundle.l10n.<locale>.json` (for runtime strings)
3. No code changes required

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, CI
- `i18n`: Internationalization / translations

### Examples

```
feat(import): add support for windsurf target format
fix(storage): handle special characters in skill IDs
docs: update README with new screenshots
i18n: add Korean translations
```

## Pull Request Process

1. Ensure your code passes lint: `npm run lint`
2. Ensure your code compiles: `npm run compile`
3. Update documentation if applicable
4. Fill out the PR template completely
5. Request review from maintainers

### PR Checklist

- [ ] Code compiles without errors
- [ ] Lint passes with no errors
- [ ] New strings are wrapped with `vscode.l10n.t()`
- [ ] i18n bundles updated for new strings (at minimum `en`)
- [ ] README updated if adding features

## Reporting Bugs

Use the [Bug Report](https://github.com/yen0304/Skill-Dock/issues/new?template=bug_report.md) issue template. Include:

- VS Code version
- Extension version
- OS and version
- Steps to reproduce
- Expected vs actual behavior

## Suggesting Features

Use the [Feature Request](https://github.com/yen0304/Skill-Dock/issues/new?template=feature_request.md) issue template. Include:

- Use case description
- Proposed solution
- Alternatives considered

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
