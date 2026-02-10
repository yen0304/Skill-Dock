import * as vscode from 'vscode';
import { TARGET_FORMATS, TargetFormat } from '../models/skill';
import { StorageService } from '../services/storageService';
import { ImportExportService } from '../services/importExportService';

/**
 * Get localized strings for the manager webview
 */
function getManagerStrings() {
  return {
    title: vscode.l10n.t('Skill Dock Manager'),
    searchPlaceholder: vscode.l10n.t('Search skills...'),
    noSkillsFound: vscode.l10n.t('No skills found'),
    noSkillsHint: vscode.l10n.t('Create a new skill or adjust your search.'),
    importTo: vscode.l10n.t('Import to...'),
    deleteBtn: vscode.l10n.t('Delete'),
    skillUnit: vscode.l10n.t('skill(s)'),
  };
}

/**
 * Webview panel for the full Skill Manager dashboard
 */
export class ManagerPanel {
  public static currentPanel: ManagerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private storageService: StorageService,
    private importExportService: ImportExportService,
    private readonly _extensionUri: vscode.Uri,
    private onRefresh: () => void,
  ) {
    this._panel = panel;
    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'getSkills':
            await this._sendSkills();
            break;
          case 'deleteSkill':
            await this._handleDelete(message.id);
            break;
          case 'importSkill':
            await this._handleImport(message.id, message.format);
            break;
          case 'openSkill':
            await this._handleOpen(message.id);
            break;
          case 'searchSkills':
            await this._sendSkills(message.query);
            break;
        }
      },
      null,
      this._disposables
    );

    // Listen for storage changes
    this.storageService.onDidChange(() => this._sendSkills());
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    storageService: StorageService,
    importExportService: ImportExportService,
    onRefresh: () => void,
  ): void {
    const column = vscode.ViewColumn.One;

    if (ManagerPanel.currentPanel) {
      ManagerPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'skilldockManager',
      vscode.l10n.t('Skill Dock Manager'),
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    ManagerPanel.currentPanel = new ManagerPanel(panel, storageService, importExportService, extensionUri, onRefresh);
  }

  private async _sendSkills(query?: string): Promise<void> {
    try {
      const skills = query
        ? await this.storageService.searchSkills(query)
        : await this.storageService.listSkills();

      this._panel.webview.postMessage({
        command: 'updateSkills',
        skills: skills.map(s => ({
          id: s.id,
          name: s.metadata.name,
          description: s.metadata.description,
          author: s.metadata.author || '',
          version: s.metadata.version || '',
          tags: s.metadata.tags || [],
          lastModified: s.lastModified,
          hasAdditionalFiles: !!(s.additionalFiles && s.additionalFiles.length > 0),
        })),
      });
    } catch (err) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to load skills: {0}', String(err))
      );
    }
  }

  private async _handleDelete(id: string): Promise<void> {
    const skill = await this.storageService.readSkill(id);
    if (!skill) { return; }

    const confirmResult = await vscode.window.showWarningMessage(
      vscode.l10n.t('Delete skill "{0}"? This cannot be undone.', skill.metadata.name),
      vscode.l10n.t('Delete'),
      vscode.l10n.t('Cancel')
    );

    if (confirmResult === vscode.l10n.t('Delete')) {
      await this.storageService.deleteSkill(id);
      this.onRefresh();
      vscode.window.showInformationMessage(
        vscode.l10n.t('Skill "{0}" deleted.', skill.metadata.name)
      );
    }
  }

  private async _handleImport(id: string, format: TargetFormat): Promise<void> {
    const skill = await this.storageService.readSkill(id);
    if (!skill) { return; }

    try {
      await this.importExportService.importToRepo(skill, format);
      this.onRefresh();
      vscode.window.showInformationMessage(
        vscode.l10n.t('Imported "{0}" to project.', skill.metadata.name)
      );
    } catch (err) {
      if ((err as Error).message !== 'Import cancelled') {
        vscode.window.showErrorMessage(
          vscode.l10n.t('Import failed: {0}', String(err))
        );
      }
    }
  }

  private async _handleOpen(id: string): Promise<void> {
    const skill = await this.storageService.readSkill(id);
    if (!skill) { return; }

    const doc = await vscode.workspace.openTextDocument(skill.filePath);
    await vscode.window.showTextDocument(doc);
  }

  private async _update(): Promise<void> {
    this._panel.webview.html = this._getHtmlForWebview();
    // Send initial data after a short delay
    setTimeout(() => this._sendSkills(), 100);
  }

  private _getHtmlForWebview(): string {
    const nonce = getNonce();
    const t = getManagerStrings();
    const formatOptions = Object.entries(TARGET_FORMATS)
      .map(([key, config]) => `<option value="${key}">${config.label}</option>`)
      .join('');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>${t.title}</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --input-bg: var(--vscode-input-background);
      --input-border: var(--vscode-input-border);
      --input-fg: var(--vscode-input-foreground);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --btn-secondary-bg: var(--vscode-button-secondaryBackground);
      --btn-secondary-fg: var(--vscode-button-secondaryForeground);
      --border: var(--vscode-panel-border);
      --focus: var(--vscode-focusBorder);
      --badge-bg: var(--vscode-badge-background);
      --badge-fg: var(--vscode-badge-foreground);
      --list-hover: var(--vscode-list-hoverBackground);
      --desc-fg: var(--vscode-descriptionForeground);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background: var(--bg);
      padding: 0;
    }

    .header {
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--border);
    }

    .header h1 {
      font-size: 1.5em;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .header-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .search-box {
      flex: 1;
      padding: 6px 10px;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      font-family: inherit;
      font-size: inherit;
    }

    .search-box:focus {
      outline: none;
      border-color: var(--focus);
    }

    .stats {
      font-size: 0.85em;
      color: var(--desc-fg);
      padding: 0 4px;
    }

    .content {
      padding: 0;
    }

    .skill-list {
      list-style: none;
    }

    .skill-item {
      display: flex;
      align-items: center;
      padding: 12px 24px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.1s;
    }

    .skill-item:hover {
      background: var(--list-hover);
    }

    .skill-icon {
      width: 32px;
      height: 32px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1em;
      margin-right: 12px;
      flex-shrink: 0;
    }

    .skill-info {
      flex: 1;
      min-width: 0;
    }

    .skill-name {
      font-weight: 600;
      margin-bottom: 2px;
    }

    .skill-desc {
      font-size: 0.85em;
      color: var(--desc-fg);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .skill-meta {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .tag {
      font-size: 0.75em;
      padding: 1px 6px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      border-radius: 10px;
    }

    .skill-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .skill-item:hover .skill-actions {
      opacity: 1;
    }

    .action-btn {
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.85em;
      background: var(--btn-secondary-bg);
      color: var(--btn-secondary-fg);
    }

    .action-btn:hover {
      background: var(--btn-bg);
      color: var(--btn-fg);
    }

    .action-btn.danger:hover {
      background: var(--vscode-errorForeground, #f44);
      color: #fff;
    }

    .import-select {
      padding: 3px 6px;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      font-size: 0.8em;
      cursor: pointer;
    }

    .empty-state {
      text-align: center;
      padding: 60px 24px;
      color: var(--desc-fg);
    }

    .empty-state h2 {
      margin-bottom: 8px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ ${t.title}</h1>
    <div class="header-row">
      <input type="text" class="search-box" id="searchBox" placeholder="${t.searchPlaceholder}" />
      <span class="stats" id="stats"></span>
    </div>
  </div>

  <div class="content">
    <ul class="skill-list" id="skillList"></ul>
    <div class="empty-state" id="emptyState" style="display:none">
      <h2>${t.noSkillsFound}</h2>
      <p>${t.noSkillsHint}</p>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const loc = ${JSON.stringify({
      importTo: t.importTo,
      deleteBtn: t.deleteBtn,
      skillUnit: t.skillUnit,
    })};
    let skills = [];

    const searchBox = document.getElementById('searchBox');
    const skillList = document.getElementById('skillList');
    const emptyState = document.getElementById('emptyState');
    const stats = document.getElementById('stats');

    // Request initial data
    vscode.postMessage({ command: 'getSkills' });

    // Search debounce
    let searchTimer;
    searchBox.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const query = searchBox.value.trim();
        if (query) {
          vscode.postMessage({ command: 'searchSkills', query });
        } else {
          vscode.postMessage({ command: 'getSkills' });
        }
      }, 300);
    });

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.command === 'updateSkills') {
        skills = message.skills;
        renderSkills();
      }
    });

    function renderSkills() {
      stats.textContent = skills.length + ' ' + loc.skillUnit;

      if (skills.length === 0) {
        skillList.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }

      emptyState.style.display = 'none';
      skillList.innerHTML = skills.map(skill => {
        const tags = skill.tags.map(t =>
          '<span class="tag">' + escapeHtml(t) + '</span>'
        ).join('');

        const meta = [
          skill.author ? 'by ' + escapeHtml(skill.author) : '',
          skill.version ? 'v' + escapeHtml(skill.version) : '',
        ].filter(Boolean).join(' · ');

        return '<li class="skill-item" data-skill-id="'+escapeHtml(skill.id)+'" data-action="open">' +
          '<div class="skill-icon">✦</div>' +
          '<div class="skill-info">' +
            '<div class="skill-name">' + escapeHtml(skill.name) + '</div>' +
            '<div class="skill-desc">' + escapeHtml(skill.description) + '</div>' +
            (meta || tags ? '<div class="skill-meta">' +
              (meta ? '<span style="font-size:0.8em;opacity:0.7">' + meta + '</span>' : '') +
              tags +
            '</div>' : '') +
          '</div>' +
          '<div class="skill-actions">' +
            '<select class="import-select" data-skill-id="'+escapeHtml(skill.id)+'" data-action="import">' +
              '<option value="">' + escapeHtml(loc.importTo) + '</option>' +
              '${formatOptions}' +
            '</select>' +
            '<button class="action-btn danger" data-skill-id="'+escapeHtml(skill.id)+'" data-action="delete">'+escapeHtml(loc.deleteBtn)+'</button>' +
          '</div>' +
        '</li>';
      }).join('');

      // Attach event listeners via delegation (CSP blocks inline handlers)
      attachSkillListEvents();
    }

    function attachSkillListEvents() {
      // Skill item click (open)
      skillList.querySelectorAll('.skill-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          // Don't trigger open when clicking actions
          if (e.target.closest('.skill-actions')) return;
          var id = item.getAttribute('data-skill-id');
          if (id) openSkill(id);
        });
      });

      // Import select
      skillList.querySelectorAll('.import-select').forEach(function(select) {
        select.addEventListener('click', function(e) { e.stopPropagation(); });
        select.addEventListener('change', function() {
          var id = select.getAttribute('data-skill-id');
          var format = select.value;
          if (id && format) importSkill(id, format);
          select.selectedIndex = 0;
        });
      });

      // Delete buttons
      skillList.querySelectorAll('[data-action="delete"]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-skill-id');
          if (id) deleteSkill(id);
        });
      });
    }

    function openSkill(id) {
      vscode.postMessage({ command: 'openSkill', id });
    }

    function deleteSkill(id) {
      vscode.postMessage({ command: 'deleteSkill', id });
    }

    function importSkill(id, format) {
      if (!format) return;
      vscode.postMessage({ command: 'importSkill', id, format });
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
  }

  private _disposed = false;

  dispose(): void {
    if (this._disposed) { return; }
    this._disposed = true;

    ManagerPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
