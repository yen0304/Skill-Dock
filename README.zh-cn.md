# Skill Dock

> 本地优先的 VS Code / Cursor Agent Skill 管理器。

[English](README.md) | [繁體中文](README.zh-tw.md) | 简体中文 | [日本語](README.ja.md)

[![CI](https://github.com/yen0304/Skill-Dock/actions/workflows/ci.yml/badge.svg)](https://github.com/yen0304/Skill-Dock/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/yen0304/Skill-Dock/branch/main/graph/badge.svg)](https://codecov.io/gh/yen0304/Skill-Dock)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/skill-dock.skill-dock?label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=skill-dock.skill-dock)

跨项目浏览、创建、编辑、删除和导入 Agent Skills — 支持多种 AI 助手格式。

<p align="center">
  <img src="media/demo.gif" alt="Skill Dock 演示" width="800">
</p>

## 快速安装

[![在 VS Code 中安装](https://img.shields.io/badge/Install%20in-VS%20Code-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=skill-dock.skill-dock)

或在 VS Code 扩展面板（`Ctrl+Shift+X`）中搜索 **"Skill Dock"**。

**从命令行安装：**

```bash
code --install-extension skill-dock.skill-dock
```

---

## 功能

### 技能库

Skills 存储在本地计算机上（默认为 `~/.skilldock/skills/`）。  
完整 CRUD 操作：创建、查看、编辑、删除、复制、搜索。

### 侧边栏浏览器

- **技能库**面板 — 浏览所有本地存储的 Skills
- **项目 Skills** 面板 — 查看当前项目中的 Skills，按格式分组
- **Skill 市场**面板 — 浏览市场来源，点击打开筛选后的市场

### Agent Skill 市场

从 GitHub 仓库浏览并安装 Agent Skills：

- **内置来源**：Anthropic Skills、OpenAI Skills、GitHub Awesome Copilot Skills、Vercel Skills、Vercel Agent Skills
- **skills.sh 生态系统搜索**：直接从市场搜索整个 [skills.sh](https://skills.sh) 注册表（与 `npx skills` 使用相同后端）。发现数千个社区 Skills，一键安装到技能库。
- **自定义来源**：添加任何 GitHub 仓库 URL 作为 Skill 来源
- **面板内预览**：点击 Skill 查看完整渲染内容
- **来源筛选**：支持全选 / 取消全选的多选芯片筛选
- **一键安装**：将 Skills 直接安装到本地技能库

### 管理器仪表板

功能齐全的 Webview 面板，支持搜索、导入和删除的技能库管理。

### 导入到任何仓库

从技能库导入 Skills 到当前的工作区。选择目标格式：

| 格式 | 目录 | Agent / 工具 |
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
| Universal | `.agents/skills/` | 多 Agent 共享目录 |

支持多选导入。可将项目 Skills 保存回技能库。

### 安装统计 & 按最常使用排序

每次从市场安装 Skill 时，安装次数会记录在本地（技能库文件夹中的 `.stats.json`）。在技能库树形视图中悬停 Skill 可查看安装次数。按**最常安装**排序，显示最常引用的 Skills。

### 安全的 GitHub Token

GitHub 个人访问令牌存储在 VS Code 加密的 **SecretStorage** 中（不会存储在明文设置中）。使用 `Skill Dock: 设置 GitHub Token` 存储您的令牌 — 可将 GitHub API 速率限制从每小时 60 次提升到 5,000 次。

### Skill 编辑器

可视化表单编辑器，用于创建和编辑 Skills — 元数据字段（名称、描述、作者、版本、许可证、标签）和 Markdown 正文。

### 多语言支持

| 语言 | 代码 |
|------|------|
| English | `en`（默认）|
| 繁體中文 | `zh-tw` |
| 简体中文 | `zh-cn` |
| 日本語 | `ja` |

自动跟随您的 VS Code 显示语言切换。

---

## 命令

所有命令可通过 `Ctrl+Shift+P`（macOS 为 `Cmd+Shift+P`）在 **Skill Dock** 分类下使用。

| 命令 | 描述 |
|------|------|
| `Skill Dock: 创建新 Skill` | 在技能库中创建新 Skill |
| `Skill Dock: 编辑 Skill` | 编辑现有 Skill |
| `Skill Dock: 删除 Skill` | 从技能库删除 Skill |
| `Skill Dock: 查看 Skill` | 在编辑器中打开 SKILL.md |
| `Skill Dock: 导入 Skill 到项目` | 将 Skill 导入到当前项目 |
| `Skill Dock: 保存 Skill 到技能库` | 将项目 Skill 保存到本地技能库 |
| `Skill Dock: 复制 Skill` | 复制 Skill 作为模板 |
| `Skill Dock: 搜索 Skills` | 按关键字搜索 Skills |
| `Skill Dock: 打开 Skill 管理器` | 打开管理器仪表板 |
| `Skill Dock: 打开技能库文件夹` | 在操作系统文件管理器中显示技能库文件夹 |
| `Skill Dock: 打开 Skill 市场` | 从 GitHub 浏览并安装 Skills |
| `Skill Dock: 添加市场来源` | 添加自定义 GitHub 仓库作为 Skill 来源 |
| `Skill Dock: 移除市场来源` | 移除自定义市场来源 |
| `Skill Dock: 加入技能库` | 将项目 Skill 保存到技能库（行内按钮） |
| `Skill Dock: 排序技能库` | 更改技能库排序方式（名称 / 最后修改 / 作者 / 最常使用） |
| `Skill Dock: 设置 GitHub Token` | 安全存储 GitHub 个人访问令牌（提升 API 速率限制） |
| `Skill Dock: 清除 GitHub Token` | 移除已存储的 GitHub 令牌 |

---

## 设置

| 设置 | 默认值 | 描述 |
|------|--------|------|
| `skilldock.libraryPath` | `~/.skilldock/skills` | 技能库的自定义路径 |
| `skilldock.defaultTarget` | `claude` | 导入时的默认目标格式 |
| `skilldock.showRepoSkills` | `true` | 显示项目 Skills 面板 |
| `skilldock.marketplaceSources` | `[]` | 自定义市场来源 URL |
| `skilldock.librarySortBy` | `"name"` | 技能库排序方式：`name`、`lastModified`、`author`、`mostUsed` |

> **GitHub Token**：使用 `设置 GitHub Token` 命令，安全存储到 VS Code 的加密凭据存储库。不会存储在明文设置中。

---

## Skill 格式

Skills 使用带有 YAML frontmatter 的 `SKILL.md` 格式：

```markdown
---
name: my-skill
description: 此 Skill 的用途与使用时机。
author: your-name
version: "1.0"
license: MIT
tags:
  - coding
  - review
---

# My Skill

指令与工作流程内容...
```

---

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式
npm run watch

# 运行测试
npm test

# 监听模式测试
npm run test:watch

# 覆盖率测试
npm run test:coverage

# 代码检查
npm run lint

# 格式化
npm run format

# 打包
npm run package
```

详细开发指南请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 贡献

欢迎贡献！请在开始之前阅读 [Contributing Guide](CONTRIBUTING.md) 和 [Code of Conduct](CODE_OF_CONDUCT.md)。

## 安全

安全相关问题请参阅 [Security Policy](SECURITY.md)。

## 变更日志

变更记录请参阅 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

[MIT](LICENSE) © Skill Dock Contributors
