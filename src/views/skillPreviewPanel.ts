import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Skill } from '../models/skill';
import { markdownToHtml, escapeHtmlStr } from './marketplacePanel';

// ------------------------------------------------------------------
// Localised strings
// ------------------------------------------------------------------
function getPreviewStrings() {
  return {
    previewTitle: vscode.l10n.t('Skill Preview'),
    author: vscode.l10n.t('Author:'),
    version: vscode.l10n.t('Version:'),
    tags: vscode.l10n.t('Tags:'),
    license: vscode.l10n.t('License:'),
    compatibility: vscode.l10n.t('Compatibility:'),
    files: vscode.l10n.t('Files:'),
    editSkill: vscode.l10n.t('Edit Skill'),
    openFile: vscode.l10n.t('Open in Editor'),
    importToRepo: vscode.l10n.t('Import to Repo'),
    noContent: vscode.l10n.t('No content available.'),
    loadingFile: vscode.l10n.t('Loading file...'),
    failedToLoad: vscode.l10n.t('Failed to load file: {0}', ''),
    installedCount: (n: number) => vscode.l10n.t('Installed {0} time(s)', n),
    close: vscode.l10n.t('Close'),
  };
}

/**
 * Read-only preview panel for a skill in the library.
 * Shows rendered SKILL.md content, metadata, and lets users browse additional files.
 */
export class SkillPreviewPanel {
  public static currentPanels: Map<string, SkillPreviewPanel> = new Map();
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private skill: Skill,
    private readonly _extensionUri: vscode.Uri,
    private _onAction?: (action: string, skill: Skill) => void,
  ) {
    this._panel = panel;
    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'openFile': {
            const filePath = message.filePath as string;
            // Safety: must be within skill dir
            const resolved = path.resolve(filePath);
            if (!resolved.startsWith(this.skill.dirPath)) { break; }
            const doc = await vscode.workspace.openTextDocument(resolved);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            break;
          }
          case 'readFile': {
            const filePath = message.filePath as string;
            const resolved = path.resolve(filePath);
            if (!resolved.startsWith(this.skill.dirPath)) { break; }
            try {
              const content = await fs.readFile(resolved, 'utf-8');
              const ext = path.extname(resolved).toLowerCase();
              const isMarkdown = ['.md', '.mdx'].includes(ext);
              this._postMessage({
                command: 'fileContent',
                filePath,
                content: isMarkdown ? markdownToHtml(content) : content,
                isMarkdown,
                fileName: path.basename(resolved),
              });
            } catch (err) {
              this._postMessage({
                command: 'fileContent',
                filePath,
                content: '',
                error: String(err),
              });
            }
            break;
          }
          case 'edit':
            this._onAction?.('edit', this.skill);
            break;
          case 'import':
            this._onAction?.('import', this.skill);
            break;
        }
      },
      null,
      this._disposables,
    );
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    skill: Skill,
    onAction?: (action: string, skill: Skill) => void,
  ): void {
    const column = vscode.ViewColumn.One;
    const panelKey = skill.id;

    if (SkillPreviewPanel.currentPanels.has(panelKey)) {
      const existing = SkillPreviewPanel.currentPanels.get(panelKey)!;
      existing.skill = skill;
      existing._update();
      existing._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'skilldockPreview',
      `${skill.metadata.name}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );

    const instance = new SkillPreviewPanel(panel, skill, extensionUri, onAction);
    SkillPreviewPanel.currentPanels.set(panelKey, instance);
  }

  private dispose(): void {
    SkillPreviewPanel.currentPanels.delete(this.skill.id);
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }

  private _postMessage(msg: { command: string; [key: string]: unknown }): void {
    this._panel.webview.postMessage(msg);
  }

  private _update(): void {
    this._panel.title = this.skill.metadata.name;
    this._panel.webview.html = this._getHtml();
  }

  private _getHtml(): string {
    const t = getPreviewStrings();
    const s = this.skill;
    const bodyHtml = s.body ? markdownToHtml(s.body) : `<p style="opacity:0.5">${t.noContent}</p>`;

    // Build metadata section
    const meta: string[] = [];
    if (s.metadata.author) { meta.push(`<span class="meta-item"><strong>${escapeHtmlStr(t.author)}</strong> ${escapeHtmlStr(s.metadata.author)}</span>`); }
    if (s.metadata.version) { meta.push(`<span class="meta-item"><strong>${escapeHtmlStr(t.version)}</strong> ${escapeHtmlStr(s.metadata.version)}</span>`); }
    if (s.metadata.license) { meta.push(`<span class="meta-item"><strong>${escapeHtmlStr(t.license)}</strong> ${escapeHtmlStr(s.metadata.license)}</span>`); }
    if (s.metadata.compatibility) { meta.push(`<span class="meta-item"><strong>${escapeHtmlStr(t.compatibility)}</strong> ${escapeHtmlStr(s.metadata.compatibility)}</span>`); }
    if (s.installCount && s.installCount > 0) { meta.push(`<span class="meta-item">${escapeHtmlStr(t.installedCount(s.installCount))}</span>`); }

    const tagsHtml = s.metadata.tags && s.metadata.tags.length > 0
      ? `<div class="tags">${s.metadata.tags.map(tag => `<span class="tag">${escapeHtmlStr(tag)}</span>`).join('')}</div>`
      : '';

    // Build file tree (nested)
    const allFiles = ['SKILL.md', ...(s.additionalFiles ?? []).filter(f => !f.endsWith('/'))];
    const folders = (s.additionalFiles ?? []).filter(f => f.endsWith('/'));
    const fileTreeHtml = SkillPreviewPanel._buildFileTreeHtml(s, allFiles, folders);

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border, #333);
    --accent: var(--vscode-textLink-foreground, #3794ff);
    --btn-bg: var(--vscode-button-background, #0e639c);
    --btn-fg: var(--vscode-button-foreground, #fff);
    --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
    --card-bg: var(--vscode-editorWidget-background, #252526);
    --badge-bg: var(--vscode-badge-background, #4d4d4d);
    --badge-fg: var(--vscode-badge-foreground, #fff);
    --input-bg: var(--vscode-input-background, #3c3c3c);
    --code-bg: var(--vscode-textCodeBlock-background, #1e1e1e);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: var(--vscode-font-family); color: var(--fg); background: var(--bg); padding: 0; overflow: hidden; height: 100vh; display: flex; flex-direction: column; }

  /* Header */
  .header { padding: 16px 20px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .header h1 { font-size: 1.3em; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
  .header .desc { opacity: 0.8; font-size: 0.9em; margin-bottom: 8px; }
  .meta-row { display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.82em; opacity: 0.75; margin-bottom: 6px; }
  .meta-item strong { margin-right: 4px; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .tag { background: var(--badge-bg); color: var(--badge-fg); border-radius: 9999px; padding: 2px 8px; font-size: 0.78em; }
  .actions { display: flex; gap: 8px; margin-top: 10px; }
  .btn { background: var(--btn-bg); color: var(--btn-fg); border: none; padding: 4px 12px; border-radius: 3px; cursor: pointer; font-size: 0.85em; }
  .btn:hover { background: var(--btn-hover); }
  .btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--fg); }
  .btn-secondary:hover { background: var(--card-bg); }

  /* Main layout */
  .main { display: flex; flex: 1; overflow: hidden; }

  /* File sidebar */
  .sidebar { width: 200px; flex-shrink: 0; border-right: 1px solid var(--border); overflow-y: auto; padding: 8px 0; }
  .sidebar-title { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.6; padding: 4px 12px 6px; }
  .file-list { list-style: none; }
  .file-item { display: flex; align-items: center; gap: 6px; padding: 4px 12px; cursor: pointer; font-size: 0.85em; border-left: 2px solid transparent; }
  .file-item:hover { background: var(--card-bg); }
  .file-item.active { background: var(--card-bg); border-left-color: var(--accent); }
  .file-icon { opacity: 0.7; flex-shrink: 0; }
  .file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Folder items */
  .folder-toggle { cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 4px 12px; font-size: 0.85em; border-left: 2px solid transparent; user-select: none; }
  .folder-toggle:hover { background: var(--card-bg); }
  .folder-toggle .chevron { display: inline-block; transition: transform 0.15s; font-size: 0.7em; opacity: 0.6; }
  .folder-toggle.open .chevron { transform: rotate(90deg); }
  .folder-children { list-style: none; padding-left: 12px; }
  .folder-children.collapsed { display: none; }

  /* Content area */
  .content { flex: 1; overflow-y: auto; padding: 20px 24px; }
  .content h1 { font-size: 1.4em; margin: 16px 0 8px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  .content h2 { font-size: 1.2em; margin: 14px 0 6px; }
  .content h3 { font-size: 1.05em; margin: 12px 0 4px; }
  .content p { margin: 6px 0; line-height: 1.6; }
  .content ul, .content ol { margin: 6px 0 6px 20px; }
  .content li { margin: 2px 0; line-height: 1.5; }
  .content pre { background: var(--code-bg); border-radius: 4px; padding: 12px; overflow-x: auto; margin: 8px 0; font-size: 0.9em; }
  .content code { background: var(--code-bg); padding: 1px 4px; border-radius: 2px; font-family: var(--vscode-editor-font-family); font-size: 0.92em; }
  .content pre code { background: none; padding: 0; }
  .content blockquote { border-left: 3px solid var(--accent); padding-left: 12px; opacity: 0.85; margin: 8px 0; }
  .content a { color: var(--accent); text-decoration: none; }
  .content a:hover { text-decoration: underline; }
  .content hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }

  /* File content (code view) */
  .file-content-pre { background: var(--code-bg); border-radius: 4px; padding: 12px; overflow-x: auto; font-size: 0.88em; font-family: var(--vscode-editor-font-family); white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
  .file-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .file-header-name { font-weight: 600; font-size: 0.95em; }
  .file-header .btn { font-size: 0.78em; padding: 2px 8px; }

  .loading { text-align: center; padding: 40px; opacity: 0.6; }
</style>
</head>
<body>
  <div class="header">
    <h1>
      <span>\u{1F4D6}</span>
      <span>${escapeHtmlStr(s.metadata.name)}</span>
    </h1>
    <div class="desc">${escapeHtmlStr(s.metadata.description)}</div>
    ${meta.length > 0 ? `<div class="meta-row">${meta.join('')}</div>` : ''}
    ${tagsHtml}
    <div class="actions">
      <button class="btn" id="editBtn">\u270E ${escapeHtmlStr(t.editSkill)}</button>
      <button class="btn btn-secondary" id="importBtn">\u{1F4E5} ${escapeHtmlStr(t.importToRepo)}</button>
    </div>
  </div>

  <div class="main">
    ${allFiles.length > 1 ? `
    <div class="sidebar">
      <div class="sidebar-title">${escapeHtmlStr(t.files)} (${allFiles.length})</div>
      <ul class="file-list" id="fileList">
        ${fileTreeHtml}
      </ul>
    </div>
    ` : ''}
    <div class="content" id="contentArea">
      ${bodyHtml}
    </div>
  </div>

<script>
(function() {
  var vscode = acquireVsCodeApi();
  var contentArea = document.getElementById('contentArea');
  var fileList = document.getElementById('fileList');
  var activeFile = 'SKILL.md';
  var skillMdHtml = contentArea.innerHTML;
  var fileCache = {};

  // Edit / Import buttons
  document.getElementById('editBtn').addEventListener('click', function() {
    vscode.postMessage({ command: 'edit' });
  });
  document.getElementById('importBtn').addEventListener('click', function() {
    vscode.postMessage({ command: 'import' });
  });

  // File list clicks
  if (fileList) {
    fileList.addEventListener('click', function(e) {
      // Handle folder toggle
      var toggle = e.target.closest('.folder-toggle');
      if (toggle) {
        toggle.classList.toggle('open');
        var children = toggle.nextElementSibling;
        if (children && children.classList.contains('folder-children')) {
          children.classList.toggle('collapsed');
        }
        return;
      }

      var item = e.target.closest('.file-item');
      if (!item) return;
      var filePath = item.getAttribute('data-file');
      var fileName = item.getAttribute('data-name');
      if (!filePath) return;

      // Update active state
      fileList.querySelectorAll('.file-item').forEach(function(el) { el.classList.remove('active'); });
      item.classList.add('active');

      if (fileName === 'SKILL.md') {
        activeFile = 'SKILL.md';
        contentArea.innerHTML = skillMdHtml;
        return;
      }

      activeFile = fileName;

      if (fileCache[filePath]) {
        renderFileContent(fileCache[filePath]);
        return;
      }

      contentArea.innerHTML = '<div class="loading">${escapeHtmlStr(t.loadingFile)}</div>';
      vscode.postMessage({ command: 'readFile', filePath: filePath });
    });
  }

  // Message handler
  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (msg.command === 'fileContent') {
      if (msg.error) {
        contentArea.innerHTML = '<div class="loading" style="color:var(--vscode-errorForeground)">' + escapeHtml(msg.error) + '</div>';
        return;
      }
      var data = { content: msg.content, isMarkdown: msg.isMarkdown, fileName: msg.fileName, filePath: msg.filePath };
      fileCache[msg.filePath] = data;
      if (msg.fileName === activeFile) {
        renderFileContent(data);
      }
    }
  });

  function renderFileContent(data) {
    var header = '<div class="file-header">'
      + '<span class="file-header-name">' + escapeHtml(data.fileName) + '</span>'
      + '<button class="btn btn-secondary" onclick="openInEditor(\\''+  escapeAttr(data.filePath) + '\\')">${escapeHtmlStr(t.openFile)}</button>'
      + '</div>';

    if (data.isMarkdown) {
      contentArea.innerHTML = header + '<div>' + data.content + '</div>';
    } else {
      contentArea.innerHTML = header + '<pre class="file-content-pre">' + escapeHtml(data.content) + '</pre>';
    }
  }

  window.openInEditor = function(fp) {
    vscode.postMessage({ command: 'openFile', filePath: fp });
  };

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escapeAttr(str) {
    return String(str).replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'");
  }
})();
</script>
</body>
</html>`;
  }

  private static _fileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (name === 'SKILL.md') { return '\u{1F4C4}'; } // 📄
    if (['js', 'ts', 'mjs', 'cjs'].includes(ext)) { return '\u{2699}\u{FE0F}'; } // ⚙️
    if (['json', 'yaml', 'yml', 'toml'].includes(ext)) { return '\u{1F527}'; } // 🔧
    if (['md', 'mdx', 'txt', 'rst'].includes(ext)) { return '\u{1F4DD}'; } // 📝
    if (['sh', 'bash', 'zsh', 'ps1'].includes(ext)) { return '\u{1F4BB}'; } // 💻
    if (['py', 'rb', 'go', 'rs'].includes(ext)) { return '\u{1F4E6}'; } // 📦
    return '\u{1F4C3}'; // 📃
  }

  /**
   * Build a nested HTML file tree from flat relative-path arrays.
   */
  private static _buildFileTreeHtml(
    skill: Skill,
    files: string[],      // relative file paths (no trailing /)
    folders: string[],     // relative dir paths (with trailing /)
  ): string {
    // Group top-level dirs & files
    interface TreeNode {
      name: string;
      rel: string;    // relative path (for files), or dir prefix (for dirs)
      isDir: boolean;
      children: TreeNode[];
    }

    const buildTree = (prefix: string): TreeNode[] => {
      const nodes: TreeNode[] = [];
      const seenDirs = new Set<string>();

      // Find direct child folders
      for (const dir of folders) {
        if (!dir.startsWith(prefix)) { continue; }
        const rest = dir.slice(prefix.length);
        const slashIdx = rest.indexOf('/');
        if (slashIdx < 0) { continue; }
        const dirName = rest.slice(0, slashIdx);
        const dirRel = prefix + dirName + '/';
        if (seenDirs.has(dirRel)) { continue; }
        seenDirs.add(dirRel);
        nodes.push({ name: dirName, rel: dirRel, isDir: true, children: buildTree(dirRel) });
      }

      // Find direct child files
      for (const f of files) {
        if (prefix && !f.startsWith(prefix)) { continue; }
        const rest = prefix ? f.slice(prefix.length) : f;
        if (rest.includes('/')) { continue; } // belongs to a sub-folder
        const fp = f === 'SKILL.md' ? skill.filePath : path.join(skill.dirPath, f);
        nodes.push({ name: rest, rel: f, isDir: false, children: [] });
        // attach fp for rendering
        (nodes[nodes.length - 1] as TreeNode & { _fp?: string })._fp = fp;
      }

      return nodes;
    };

    const renderNodes = (nodes: TreeNode[], firstLevel: boolean): string => {
      return nodes.map((n, idx) => {
        if (n.isDir) {
          const childHtml = renderNodes(n.children, false);
          return '<li>'
            + `<div class="folder-toggle open"><span class="chevron">\u25B6</span><span>\u{1F4C1}</span> ${escapeHtmlStr(n.name)}</div>`
            + `<ul class="folder-children">${childHtml}</ul>`
            + '</li>';
        }
        const fp: string = (n as TreeNode & { _fp?: string })._fp ?? path.join(skill.dirPath, n.rel);
        const icon = SkillPreviewPanel._fileIcon(n.name);
        const active = firstLevel && idx === 0 && n.name === 'SKILL.md' ? ' active' : '';
        return `<li class="file-item${active}" data-file="${escapeHtmlStr(fp)}" data-name="${escapeHtmlStr(n.name)}">`
          + `<span class="file-icon">${icon}</span>`
          + `<span class="file-name">${escapeHtmlStr(n.name)}</span>`
          + '</li>';
      }).join('\n');
    };

    return renderNodes(buildTree(''), true);
  }
}
