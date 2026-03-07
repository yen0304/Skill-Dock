# Skill Dock

> 本地優先的 VS Code / Cursor Agent Skill 管理器。

[English](README.md) | 繁體中文 | [简体中文](README.zh-cn.md) | [日本語](README.ja.md)

[![CI](https://github.com/yen0304/Skill-Dock/actions/workflows/ci.yml/badge.svg)](https://github.com/yen0304/Skill-Dock/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/yen0304/Skill-Dock/branch/main/graph/badge.svg)](https://codecov.io/gh/yen0304/Skill-Dock)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/skill-dock.skill-dock?label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=skill-dock.skill-dock)

跨專案瀏覽、建立、編輯、刪除和匯入 Agent Skills — 支援多種 AI 助手格式。

<p align="center">
  <img src="media/demo.gif" alt="Skill Dock 展示" width="800">
</p>

## 快速安裝

[![在 VS Code 中安裝](https://img.shields.io/badge/Install%20in-VS%20Code-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=skill-dock.skill-dock)

或在 VS Code 擴充功能面板（`Ctrl+Shift+X`）中搜尋 **「Skill Dock」**。

**從命令列安裝：**

```bash
code --install-extension skill-dock.skill-dock
```

---

## 功能

### Skill 管理庫

Skills 儲存在本地電腦上（預設為 `~/.skilldock/skills/`）。  
完整 CRUD 操作：建立、檢視、編輯、刪除、複製、搜尋。

### 側邊欄瀏覽器

- **Skill 管理庫**面板 — 瀏覽所有本地儲存的 Skills
- **專案 Skills** 面板 — 檢視目前專案中的 Skills，依格式分類
- **Skill 市集**面板 — 瀏覽市集來源，點擊開啟篩選後的市集

### Agent Skill 市集

從 GitHub 儲存庫瀏覽並安裝 Agent Skills：

- **內建來源**：Anthropic Skills、OpenAI Skills、GitHub Awesome Copilot Skills、Vercel Skills、Vercel Agent Skills
- **skills.sh 生態系搜尋**：直接從市集搜尋整個 [skills.sh](https://skills.sh) 登錄庫（與 `npx skills` 使用相同後端）。探索數千個社群 Skills，一鍵安裝到管理庫。
- **自訂來源**：新增任何 GitHub 儲存庫 URL 作為 Skill 來源
- **面板內預覽**：點擊 Skill 查看完整渲染內容
- **來源篩選**：支援全選 / 取消全選的多選晶片篩選
- **一鍵安裝**：將 Skills 直接安裝到本地管理庫

### 管理器儀表板

功能齊全的 Webview 面板，支援搜尋、匯入和刪除的 Skill 管理庫管理。

### 匯入到任何儲存庫

從管理庫匯入 Skills 到目前的工作區。選擇目標格式：

| 格式 | 目錄 | Agent / 工具 |
|------|------|-------------|
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
| Universal | `.agents/skills/` | 多 Agent 共用目錄 |

支援多選匯入。可將專案 Skills 儲存回管理庫。

### 安裝統計 & 依最常使用排序

每次從市集安裝 Skill 時，安裝次數會記錄在本地（管理庫資料夾中的 `.stats.json`）。在管理庫樹狀圖中懸停 Skill 可查看安裝次數。以**最常安裝**排序，顯示最常參照的 Skills。

### 安全的 GitHub Token

GitHub 個人存取權杖儲存在 VS Code 加密的 **SecretStorage** 中（不會儲存在明文設定中）。使用 `Skill Dock: 設定 GitHub Token` 儲存您的權杖 — 可將 GitHub API 速率限制從每小時 60 次提升到 5,000 次。

### Skill 編輯器

視覺化表單編輯器，用於建立和編輯 Skills — 中繼資料欄位（名稱、描述、作者、版本、授權條款、標籤）和 Markdown 內文。

### 多語言支援

| 語言 | 代碼 |
|------|------|
| English | `en`（預設）|
| 繁體中文 | `zh-tw` |
| 简体中文 | `zh-cn` |
| 日本語 | `ja` |

自動依照您的 VS Code 顯示語言切換。

---

## 命令

所有命令可透過 `Ctrl+Shift+P`（macOS 為 `Cmd+Shift+P`）在 **Skill Dock** 分類下使用。

| 命令 | 描述 |
|------|------|
| `Skill Dock: 建立新 Skill` | 在管理庫中建立新 Skill |
| `Skill Dock: 編輯 Skill` | 編輯現有 Skill |
| `Skill Dock: 刪除 Skill` | 從管理庫刪除 Skill |
| `Skill Dock: 檢視 Skill` | 在編輯器中開啟 SKILL.md |
| `Skill Dock: 匯入 Skill 到專案` | 將 Skill 匯入到目前專案 |
| `Skill Dock: 儲存 Skill 到管理庫` | 將專案 Skill 儲存到本地管理庫 |
| `Skill Dock: 複製 Skill` | 複製 Skill 作為範本 |
| `Skill Dock: 搜尋 Skills` | 依關鍵字搜尋 Skills |
| `Skill Dock: 開啟 Skill 管理器` | 開啟管理器儀表板 |
| `Skill Dock: 開啟管理庫資料夾` | 在作業系統檔案管理器中顯示管理庫資料夾 |
| `Skill Dock: 開啟 Skill 市集` | 從 GitHub 瀏覽並安裝 Skills |
| `Skill Dock: 新增市集來源` | 新增自訂 GitHub 儲存庫作為 Skill 來源 |
| `Skill Dock: 移除市集來源` | 移除自訂市集來源 |
| `Skill Dock: 加入管理庫` | 將專案 Skill 儲存到管理庫（行內按鈕） |
| `Skill Dock: 排序管理庫` | 變更管理庫排序方式（名稱 / 最後修改 / 作者 / 最常使用） |
| `Skill Dock: 設定 GitHub Token` | 安全儲存 GitHub 個人存取權杖（提升 API 速率限制） |
| `Skill Dock: 清除 GitHub Token` | 移除已儲存的 GitHub 權杖 |

---

## 設定

| 設定 | 預設值 | 描述 |
|------|--------|------|
| `skilldock.libraryPath` | `~/.skilldock/skills` | Skill 管理庫的自訂路徑 |
| `skilldock.defaultTarget` | `claude` | 匯入時的預設目標格式 |
| `skilldock.showRepoSkills` | `true` | 顯示專案 Skills 面板 |
| `skilldock.marketplaceSources` | `[]` | 自訂市集來源 URL |
| `skilldock.librarySortBy` | `"name"` | 管理庫排序方式：`name`、`lastModified`、`author`、`mostUsed` |

> **GitHub Token**：使用 `設定 GitHub Token` 命令，安全儲存到 VS Code 的加密認證儲存庫。不會儲存在明文設定中。

---

## Skill 格式

Skills 使用帶有 YAML frontmatter 的 `SKILL.md` 格式：

```markdown
---
name: my-skill
description: 此 Skill 的用途與使用時機。
author: your-name
version: "1.0"
license: MIT
tags:
  - coding
  - review
---

# My Skill

指令與工作流程內容...
```

---

## 開發

```bash
# 安裝相依套件
npm install

# 編譯
npm run compile

# 監看模式
npm run watch

# 執行測試
npm test

# 監看模式測試
npm run test:watch

# 覆蓋率測試
npm run test:coverage

# 程式碼檢查
npm run lint

# 格式化
npm run format

# 打包
npm run package
```

詳細開發指引請參閱 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 貢獻

歡迎貢獻！請在開始之前閱讀 [Contributing Guide](CONTRIBUTING.md) 和 [Code of Conduct](CODE_OF_CONDUCT.md)。

## 安全性

安全性相關問題請參閱 [Security Policy](SECURITY.md)。

## 變更日誌

變更記錄請參閱 [CHANGELOG.md](CHANGELOG.md)。

## 授權條款

[MIT](LICENSE) © Skill Dock Contributors
