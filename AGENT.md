# Agent Guidelines

## Release Checklist

Before publishing a new version, you **must** update the following files:

1. **README.md** — Update feature descriptions, screenshots, badges, or any content that reflects the new version's changes.
2. **CHANGELOG.md** — Add a new version section following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format with `Added`, `Changed`, `Fixed`, or `Removed` subsections as appropriate.
3. **package.json** — Bump the `version` field following [Semantic Versioning](https://semver.org/).

Do **not** publish or tag a release until all three files are updated and consistent with each other.
