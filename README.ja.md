# Skill Dock

> VS Code / Cursor 向けのローカルファーストなエージェントスキルマネージャー。

[English](README.md) | [繁體中文](README.zh-tw.md) | [简体中文](README.zh-cn.md) | 日本語

[![CI](https://github.com/yen0304/Skill-Dock/actions/workflows/ci.yml/badge.svg)](https://github.com/yen0304/Skill-Dock/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/yen0304/Skill-Dock/branch/main/graph/badge.svg)](https://codecov.io/gh/yen0304/Skill-Dock)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/skill-dock.skill-dock?label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=skill-dock.skill-dock)

エージェントスキルの閲覧、作成、編集、削除、インポートをプロジェクト横断で実現 — 複数のAIアシスタント形式に対応。

<p align="center">
  <img src="media/demo.gif" alt="Skill Dock デモ" width="800">
</p>

## クイックインストール

[![VS Codeにインストール](https://img.shields.io/badge/Install%20in-VS%20Code-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=skill-dock.skill-dock)

または VS Code 拡張機能パネル（`Ctrl+Shift+X`）で **「Skill Dock」** を検索してください。

**コマンドラインからインストール：**

```bash
code --install-extension skill-dock.skill-dock
```

---

## 機能

### スキルライブラリ

スキルはローカルマシンに保存されます（デフォルトは `~/.skilldock/skills/`）。  
フルCRUD操作：作成、表示、編集、削除、複製、検索。

### サイドバーブラウザ

- **スキルライブラリ**パネル — ローカルに保存されたすべてのスキルを閲覧
- **リポジトリスキル**パネル — 現在のプロジェクトにあるスキルをフォーマット別に表示
- **スキルマーケットプレイス**パネル — マーケットプレイスのソースを閲覧、クリックでフィルター付きマーケットプレイスを開く

### エージェントスキルマーケットプレイス

GitHubリポジトリからエージェントスキルを閲覧・インストール：

- **ビルトインソース**: Anthropic Skills、OpenAI Skills、GitHub Awesome Copilot Skills、Vercel Skills、Vercel Agent Skills
- **skills.sh エコシステム検索**: [skills.sh](https://skills.sh) レジストリ全体（`npx skills` と同じバックエンド）をマーケットプレイスから直接検索。数千のコミュニティスキルを発見し、ワンクリックでライブラリにインストール。
- **カスタムソース**: 任意のGitHubリポジトリURLをスキルソースとして追加
- **パネル内プレビュー**: スキルをクリックしてレンダリングされた全コンテンツを表示
- **ソースフィルター**: 全選択 / 全解除トグル付きマルチセレクトチップ
- **ワンクリックインストール**: スキルをローカルライブラリに直接インストール

### マネージャーダッシュボード

検索、インポート、削除機能を備えたスキルライブラリ管理用のフル機能Webviewパネル。

### 任意のリポジトリにインポート

ライブラリからスキルを現在のワークスペースにインポート。ターゲット形式を選択：

| 形式 | ディレクトリ | エージェント / ツール |
|------|-------------|----------------------|
| Claude | `.claude/skills/` | Claude Code / Claude Desktop |
| Cursor | `.agents/skills/` | Cursor IDE |
| Codex | `.agents/skills/` | OpenAI Codex |
| GitHub | `.github/skills/` | GitHub Skills |
| GitHub Copilot | `.agents/skills/` | GitHub Copilot |
| Windsurf | `.windsurf/skills/` | Windsurf IDE |
| Cline | `.agents/skills/` | Cline |
| Roo Code | `.roo/skills/` | Roo Code |
| Continue | `.continue/skills/` | Continue |
| Augment | `.augment/skills/` | Augment |
| OpenCode | `.agents/skills/` | OpenCode |
| Goose | `.goose/skills/` | Goose |
| Gemini CLI | `.agents/skills/` | Gemini CLI |
| Amp | `.agents/skills/` | Amp |
| Kilo Code | `.kilocode/skills/` | Kilo Code |
| Junie | `.junie/skills/` | Junie |
| Trae | `.trae/skills/` | Trae IDE |
| Droid | `.factory/skills/` | Factory AI / Droid |
| Kode | `.kode/skills/` | Kode |
| OpenHands | `.openhands/skills/` | OpenHands |
| Universal | `.agents/skills/` | 複数エージェント共有ディレクトリ |

マルチセレクトインポート対応。リポジトリのスキルをライブラリに保存可能。

### インストール統計 & 最多使用順ソート

マーケットプレイスからスキルをインストールするたびに、ローカル（ライブラリフォルダの `.stats.json`）にインストール回数が記録されます。ライブラリツリーでスキルにホバーすると、インストール回数を確認できます。**最多使用**順でソートすることで、最も参照されるスキルを表示。

### セキュアなGitHubトークン

GitHub 個人アクセストークンは VS Code の暗号化された **SecretStorage** に保存されます（プレーンテキスト設定には保存されません）。`Skill Dock: GitHub トークンを設定` でトークンを保存すると、GitHub APIのレート制限が1時間あたり60回から5,000回に引き上げられます。

### スキルエディタ

スキルの作成・編集用ビジュアルフォームベースエディタ — メタデータフィールド（名前、説明、作者、バージョン、ライセンス、タグ）とMarkdown本文。

### 多言語サポート

| 言語 | コード |
|------|--------|
| English | `en`（デフォルト）|
| 繁體中文 | `zh-tw` |
| 简体中文 | `zh-cn` |
| 日本語 | `ja` |

VS Codeの表示言語に自動的に従います。

---

## コマンド

すべてのコマンドは `Ctrl+Shift+P`（macOSでは `Cmd+Shift+P`）から **Skill Dock** カテゴリで利用可能です。

| コマンド | 説明 |
|----------|------|
| `Skill Dock: 新しいスキルを作成` | ライブラリに新しいスキルを作成 |
| `Skill Dock: スキルを編集` | 既存のスキルを編集 |
| `Skill Dock: スキルを削除` | ライブラリからスキルを削除 |
| `Skill Dock: スキルを表示` | SKILL.mdをエディタで開く |
| `Skill Dock: スキルをリポジトリにインポート` | スキルを現在のプロジェクトにインポート |
| `Skill Dock: スキルをライブラリに保存` | リポジトリのスキルをローカルライブラリに保存 |
| `Skill Dock: スキルを複製` | スキルをテンプレートとして複製 |
| `Skill Dock: スキルを検索` | キーワードでスキルを検索 |
| `Skill Dock: スキルマネージャーを開く` | マネージャーダッシュボードを開く |
| `Skill Dock: ライブラリフォルダを開く` | OSファイルマネージャーでライブラリフォルダを表示 |
| `Skill Dock: スキルマーケットプレイスを開く` | GitHubからスキルを閲覧・インストール |
| `Skill Dock: マーケットプレイスソースを追加` | カスタムGitHubリポジトリをスキルソースとして追加 |
| `Skill Dock: マーケットプレイスソースを削除` | カスタムマーケットプレイスソースを削除 |
| `Skill Dock: ライブラリに追加` | リポジトリのスキルをライブラリに保存（インラインボタン） |
| `Skill Dock: ライブラリを並べ替え` | ライブラリの並べ替え順を変更（名前 / 更新日 / 作者 / 最多使用） |
| `Skill Dock: GitHub トークンを設定` | GitHub個人アクセストークンをセキュアに保存（APIレート制限を引き上げ） |
| `Skill Dock: GitHub トークンをクリア` | 保存されたGitHubトークンを削除 |

---

## 設定

| 設定項目 | デフォルト | 説明 |
|----------|-----------|------|
| `skilldock.libraryPath` | `~/.skilldock/skills` | スキルライブラリのカスタムパス |
| `skilldock.defaultTarget` | `claude` | インポート時のデフォルトターゲット形式 |
| `skilldock.showRepoSkills` | `true` | リポジトリスキルパネルを表示 |
| `skilldock.marketplaceSources` | `[]` | カスタムマーケットプレイスソースURL |
| `skilldock.librarySortBy` | `"name"` | ライブラリの並べ替え順：`name`、`lastModified`、`author`、`mostUsed` |

> **GitHub トークン**：`GitHub トークンを設定` コマンドを使用して、VS Codeの暗号化された認証情報ストアに安全に保存してください。プレーンテキスト設定には保存されません。

---

## スキル形式

スキルは YAML フロントマター付きの `SKILL.md` 形式を使用します：

```markdown
---
name: my-skill
description: このスキルの用途と使用タイミング。
author: your-name
version: "1.0"
license: MIT
tags:
  - coding
  - review
---

# My Skill

指示・ワークフロー内容をここに記述...
```

---

## 開発

```bash
# 依存関係のインストール
npm install

# コンパイル
npm run compile

# ウォッチモード
npm run watch

# テスト実行
npm test

# ウォッチモードでテスト
npm run test:watch

# カバレッジ付きテスト
npm run test:coverage

# リント
npm run lint

# フォーマット
npm run format

# パッケージ
npm run package
```

詳細な開発ガイドラインは [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

---

## コントリビューション

コントリビューションは歓迎します！始める前に [Contributing Guide](CONTRIBUTING.md) と [Code of Conduct](CODE_OF_CONDUCT.md) をお読みください。

## セキュリティ

セキュリティに関する懸念は [Security Policy](SECURITY.md) をご覧ください。

## 変更履歴

変更一覧は [CHANGELOG.md](CHANGELOG.md) を参照してください。

## ライセンス

[MIT](LICENSE) © Skill Dock Contributors
