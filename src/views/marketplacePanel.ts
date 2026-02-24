import * as vscode from 'vscode';
import { MarketplaceService } from '../services/marketplaceService';

/** Messages sent from the extension host to the marketplace webview */
interface WebviewMessage {
  command: string;
  [key: string]: unknown;
}

// ------------------------------------------------------------------
// Localised strings helper
// ------------------------------------------------------------------
function getMarketplaceStrings() {
  return {
    title: vscode.l10n.t('Agent Skill Marketplace'),
    searchPlaceholder: vscode.l10n.t('Search marketplace skills...'),
    noSkillsFound: vscode.l10n.t('No skills found'),
    noSkillsHint: vscode.l10n.t('Try refreshing or adding a new source.'),
    installBtn: vscode.l10n.t('Install'),
    installedLabel: vscode.l10n.t('Installed'),
    updateBtn: vscode.l10n.t('↑ Update'),
    refreshBtn: vscode.l10n.t('Refresh'),
    addSourceBtn: vscode.l10n.t('Add Source'),
    removeSourceBtn: vscode.l10n.t('Remove'),
    allSources: vscode.l10n.t('All Sources'),
    loading: vscode.l10n.t('Loading skills from GitHub...'),
    skillUnit: vscode.l10n.t('skill(s)'),
    sourceLabel: vscode.l10n.t('Source:'),
    backBtn: vscode.l10n.t('Back'),
    previewLoadingBody: vscode.l10n.t('Loading content...'),
    selectAll: vscode.l10n.t('Select All'),
    deselectAll: vscode.l10n.t('Deselect All'),
  };
}

// ------------------------------------------------------------------
// Panel
// ------------------------------------------------------------------
export class MarketplacePanel {
  public static currentPanel: MarketplacePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _disposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private marketplaceService: MarketplaceService,
    private readonly _extensionUri: vscode.Uri,
    private onRefresh: () => void,
  ) {
    this._panel = panel;
    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (this._disposed) { return; }
        switch (msg.command) {
          case 'ready':
            await this._loadSkills(false);
            break;
          case 'refresh':
            await this._loadSkills(true);
            break;
          case 'install':
            await this._handleInstall(msg.sourceId, msg.repoPath);
            break;
          case 'update':
            await this._handleUpdate(msg.sourceId, msg.repoPath);
            break;
          case 'preview':
            await this._handlePreview(msg.sourceId, msg.repoPath);
            break;
          case 'addSource':
            await this._handleAddSource();
            break;
          case 'removeSource':
            await this._handleRemoveSource(msg.sourceId);
            break;
        }
      },
      null,
      this._disposables,
    );
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    marketplaceService: MarketplaceService,
    onRefresh: () => void,
    filterSourceId?: string,
  ): void {
    const column = vscode.ViewColumn.One;

    if (MarketplacePanel.currentPanel) {
      MarketplacePanel.currentPanel._panel.reveal(column);
      if (filterSourceId) {
        MarketplacePanel.currentPanel._postMessage({ command: 'filterSource', sourceId: filterSourceId });
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'skilldockMarketplace',
      vscode.l10n.t('Agent Skill Marketplace'),
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );

    MarketplacePanel.currentPanel = new MarketplacePanel(
      panel,
      marketplaceService,
      extensionUri,
      onRefresh,
    );

    if (filterSourceId) {
      MarketplacePanel.currentPanel._pendingFilter = filterSourceId;
    }
  }

  /** Source ID to apply as filter once skills are loaded */
  private _pendingFilter: string | undefined;

  // ------------------------------------------------------------------
  // Message handlers
  // ------------------------------------------------------------------

  private async _loadSkills(force: boolean): Promise<void> {
    try {
      this._postMessage({ command: 'loading' });

      const [skills, installedIds, installedVersions] = await Promise.all([
        this.marketplaceService.fetchAll(force),
        this.marketplaceService.getInstalledIds(),
        this.marketplaceService.getInstalledVersionMap(),
      ]);

      const sources = this.marketplaceService.getSources();

      this._postMessage({
        command: 'updateSkills',
        skills: skills.map((s) => {
          const installed = installedIds.has(s.id);
          const remoteVersion = s.metadata.version;
          const localVersion = installedVersions.get(s.id);
          const hasUpdate = installed && !!remoteVersion && !!localVersion && remoteVersion !== localVersion;
          return {
            id: s.id,
            name: s.metadata.name,
            description: s.metadata.description,
            author: s.metadata.author || '',
            version: s.metadata.version || '',
            tags: s.metadata.tags || [],
            sourceId: s.source.id,
            sourceLabel: s.source.label,
            repoPath: s.repoPath,
            installed,
            hasUpdate,
          };
        }),
        sources: sources.map((s) => ({
          id: s.id,
          label: s.label,
          isBuiltin: s.isBuiltin,
        })),
      });

      // Apply pending source filter if set
      if (this._pendingFilter) {
        this._postMessage({ command: 'filterSource', sourceId: this._pendingFilter });
        this._pendingFilter = undefined;
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to load marketplace: {0}', String(err))
      );
    }
  }

  private async _handleInstall(sourceId: string, repoPath: string): Promise<void> {
    try {
      const skills = await this.marketplaceService.fetchAll(false);
      const skill = skills.find(
        (s) => s.source.id === sourceId && s.repoPath === repoPath
      );
      if (!skill) { return; }

      await this.marketplaceService.installSkill(skill);
      this.onRefresh();

      vscode.window.showInformationMessage(
        vscode.l10n.t('Installed "{0}" to your library.', skill.metadata.name)
      );

      // Re-send installed state + update flags
      const [installedIds, installedVersions] = await Promise.all([
        this.marketplaceService.getInstalledIds(),
        this.marketplaceService.getInstalledVersionMap(),
      ]);
      const hasUpdateMap: Record<string, boolean> = {};
      for (const s of skills) {
        const installed = installedIds.has(s.id);
        const remoteVersion = s.metadata.version;
        const localVersion = installedVersions.get(s.id);
        hasUpdateMap[s.id] = installed && !!remoteVersion && !!localVersion && remoteVersion !== localVersion;
      }
      this._postMessage({
        command: 'updateInstalled',
        installedIds: [...installedIds],
        hasUpdateMap,
      });
    } catch (err) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Install failed: {0}', String(err))
      );
    }
  }

  private async _handleUpdate(sourceId: string, repoPath: string): Promise<void> {
    try {
      const skills = await this.marketplaceService.fetchAll(false);
      const skill = skills.find(
        (s) => s.source.id === sourceId && s.repoPath === repoPath
      );
      if (!skill) { return; }

      // Silently overwrite — user clicked "↑ Update" intentionally
      await this.marketplaceService.updateSkillSilently(skill);
      this.onRefresh();

      vscode.window.showInformationMessage(
        vscode.l10n.t('Installed "{0}" to your library.', skill.metadata.name)
      );

      // Re-send installed state + update flags (hasUpdate should now be false for this skill)
      const [installedIds, installedVersions] = await Promise.all([
        this.marketplaceService.getInstalledIds(),
        this.marketplaceService.getInstalledVersionMap(),
      ]);
      const hasUpdateMap: Record<string, boolean> = {};
      for (const s of skills) {
        const installed = installedIds.has(s.id);
        const remoteVersion = s.metadata.version;
        const localVersion = installedVersions.get(s.id);
        hasUpdateMap[s.id] = installed && !!remoteVersion && !!localVersion && remoteVersion !== localVersion;
      }
      this._postMessage({
        command: 'updateInstalled',
        installedIds: [...installedIds],
        hasUpdateMap,
      });
    } catch (err) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Install failed: {0}', String(err))
      );
    }
  }

  private async _handlePreview(sourceId: string, repoPath: string): Promise<void> {
    try {
      const skills = await this.marketplaceService.fetchAll(false);
      const skill = skills.find(
        (s) => s.source.id === sourceId && s.repoPath === repoPath
      );
      if (!skill) { return; }

      const installedIds = await this.marketplaceService.getInstalledIds();

      this._postMessage({
        command: 'showPreview',
        skill: {
          id: skill.id,
          name: skill.metadata.name,
          description: skill.metadata.description,
          author: skill.metadata.author || '',
          version: skill.metadata.version || '',
          license: skill.metadata.license || '',
          tags: skill.metadata.tags || [],
          sourceId: skill.source.id,
          sourceLabel: skill.source.label,
          repoPath: skill.repoPath,
          bodyHtml: markdownToHtml(skill.body || ''),
          installed: installedIds.has(skill.id),
        },
      });
    } catch (err) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to preview skill: {0}', String(err))
      );
    }
  }

  private async _handleAddSource(): Promise<void> {
    const url = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Enter a GitHub repository URL'),
      placeHolder: 'https://github.com/owner/repo  or  https://github.com/owner/repo/tree/main/skills',
      validateInput: (value) => {
        if (!value.trim()) {
          return vscode.l10n.t('URL is required');
        }
        if (!MarketplaceService.parseGitHubUrl(value)) {
          return vscode.l10n.t('Invalid GitHub URL: {0}', value);
        }
        return null;
      },
    });

    if (!url) { return; }

    try {
      await this.marketplaceService.addCustomSource(url);
      this.onRefresh();
      vscode.window.showInformationMessage(
        vscode.l10n.t('Source added: {0}', url)
      );
      await this._loadSkills(true);
    } catch (err) {
      vscode.window.showErrorMessage(String(err));
    }
  }

  private async _handleRemoveSource(sourceId: string): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      vscode.l10n.t('Remove marketplace source "{0}"?', sourceId),
      vscode.l10n.t('Remove'),
      vscode.l10n.t('Cancel')
    );
    if (confirm !== vscode.l10n.t('Remove')) { return; }

    try {
      await this.marketplaceService.removeCustomSource(sourceId);
      this.onRefresh();
      await this._loadSkills(true);
    } catch (err) {
      vscode.window.showErrorMessage(String(err));
    }
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private _postMessage(msg: WebviewMessage): void {
    if (!this._disposed) {
      this._panel.webview.postMessage(msg);
    }
  }

  private _update(): void {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  dispose(): void {
    if (this._disposed) { return; }
    this._disposed = true;

    MarketplacePanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }

  // ------------------------------------------------------------------
  // Webview HTML
  // ------------------------------------------------------------------

  private _getHtmlForWebview(): string {
    const nonce = getNonce();
    const t = getMarketplaceStrings();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
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
      --success-fg: var(--vscode-testing-iconPassed, #73c991);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background: var(--bg);
    }

    /* Header */
    .header {
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--border);
    }
    .header h1 { font-size: 1.5em; font-weight: 600; margin-bottom: 12px; }
    .header-row {
      display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    }
    .search-box {
      flex: 1; min-width: 200px;
      padding: 6px 10px;
      background: var(--input-bg); color: var(--input-fg);
      border: 1px solid var(--input-border); border-radius: 4px;
      font-family: inherit; font-size: inherit;
    }
    .search-box:focus { outline: none; border-color: var(--focus); }

    /* Source filter bar */
    .source-filters {
      display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
      padding: 10px 24px; border-bottom: 1px solid var(--border);
    }
    .toggle-all-btn {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 4px 8px; border-radius: 14px; font-size: 0.78em;
      background: transparent; color: var(--desc-fg);
      border: 1px dashed var(--input-border);
      cursor: pointer; user-select: none; transition: all 0.15s;
      margin-right: 4px;
    }
    .toggle-all-btn:hover { border-color: var(--focus); color: var(--fg); }
    .source-filter-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 14px; font-size: 0.82em;
      background: var(--input-bg); color: var(--desc-fg);
      border: 1px solid var(--input-border);
      cursor: pointer; user-select: none; transition: all 0.15s;
    }
    .source-filter-chip:hover { border-color: var(--focus); }
    .source-filter-chip.active {
      background: var(--btn-bg); color: var(--btn-fg);
      border-color: var(--btn-bg);
    }
    .source-filter-chip .chip-check {
      font-size: 0.9em; width: 14px; text-align: center;
    }

    .header-btn {
      padding: 5px 12px; border: none; border-radius: 4px; cursor: pointer;
      font-family: inherit; font-size: 0.9em;
      background: var(--btn-secondary-bg); color: var(--btn-secondary-fg);
    }
    .header-btn:hover { background: var(--btn-bg); color: var(--btn-fg); }
    .header-btn.primary { background: var(--btn-bg); color: var(--btn-fg); }
    .header-btn.primary:hover { background: var(--btn-hover); }

    .stats {
      font-size: 0.85em; color: var(--desc-fg); padding: 0 4px; white-space: nowrap;
    }

    /* Source chips */
    .source-bar {
      display: flex; gap: 6px; flex-wrap: wrap;
      padding: 10px 24px; border-bottom: 1px solid var(--border);
    }
    .source-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 12px; font-size: 0.8em;
      background: var(--badge-bg); color: var(--badge-fg);
    }
    .source-chip .remove-src {
      cursor: pointer; opacity: 0.7; font-size: 1.1em; line-height: 1;
      background: none; border: none; color: inherit; padding: 0 2px;
    }
    .source-chip .remove-src:hover { opacity: 1; }

    /* Skill list */
    .content { padding: 0; }
    .skill-list { list-style: none; }
    .skill-item {
      display: flex; align-items: center;
      padding: 12px 24px; border-bottom: 1px solid var(--border);
      transition: background 0.1s; cursor: pointer;
    }
    .skill-item:hover { background: var(--list-hover); }
    .skill-icon {
      width: 32px; height: 32px;
      background: var(--badge-bg); color: var(--badge-fg);
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.1em; margin-right: 12px; flex-shrink: 0;
    }
    .skill-info { flex: 1; min-width: 0; }
    .skill-name { font-weight: 600; margin-bottom: 2px; }
    .skill-desc {
      font-size: 0.85em; color: var(--desc-fg);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .skill-meta { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; align-items: center; }
    .tag {
      font-size: 0.75em; padding: 1px 6px;
      background: var(--badge-bg); color: var(--badge-fg); border-radius: 10px;
    }
    .source-tag {
      font-size: 0.72em; padding: 2px 8px;
      background: var(--btn-secondary-bg); color: var(--btn-secondary-fg);
      border-radius: 10px; display: inline-flex; align-items: center; gap: 3px;
    }
    .source-tag .repo-icon { opacity: 0.7; }

    .skill-actions { display: flex; gap: 4px; flex-shrink: 0; }
    .install-btn {
      padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer;
      font-family: inherit; font-size: 0.85em;
      background: var(--btn-bg); color: var(--btn-fg);
    }
    .install-btn:hover { background: var(--btn-hover); }
    .install-btn.installed {
      background: transparent; color: var(--success-fg);
      cursor: default; font-weight: 600;
    }
    .update-btn {
      padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer;
      font-family: inherit; font-size: 0.85em;
      background: var(--vscode-charts-yellow, #e9c46a); color: #1e1e1e;
    }
    .update-btn:hover { opacity: 0.85; }

    /* Empty / loading */
    .empty-state, .loading-state {
      text-align: center; padding: 60px 24px; color: var(--desc-fg);
    }
    .empty-state h2, .loading-state h2 { margin-bottom: 8px; font-weight: 500; }
    .spinner {
      display: inline-block; width: 24px; height: 24px;
      border: 3px solid var(--border); border-top-color: var(--btn-bg);
      border-radius: 50%; animation: spin 0.8s linear infinite;
      margin-bottom: 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ---- Detail / Preview View ---- */
    .detail-view { display: none; }
    .detail-view.active { display: block; }
    .list-view.hidden { display: none !important; }
    .detail-header {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 24px; border-bottom: 1px solid var(--border);
    }
    .back-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border: 1px solid var(--input-border);
      border-radius: 4px; cursor: pointer;
      background: var(--btn-secondary-bg); color: var(--btn-secondary-fg);
      font-family: inherit; font-size: 0.85em;
    }
    .back-btn:hover { background: var(--btn-bg); color: var(--btn-fg); }
    .detail-title { font-size: 1.3em; font-weight: 600; flex: 1; min-width: 0; }
    .detail-meta-bar {
      display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
      padding: 12px 24px; border-bottom: 1px solid var(--border);
      font-size: 0.85em; color: var(--desc-fg);
    }
    .detail-meta-item { display: inline-flex; align-items: center; gap: 4px; }
    .detail-meta-item strong { color: var(--fg); }
    .detail-tags { display: flex; gap: 4px; flex-wrap: wrap; }
    .detail-body {
      padding: 20px 24px; line-height: 1.7;
      overflow-wrap: break-word; word-break: break-word;
    }
    .detail-body h1 { font-size: 1.5em; margin: 20px 0 10px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
    .detail-body h2 { font-size: 1.3em; margin: 18px 0 8px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
    .detail-body h3 { font-size: 1.1em; margin: 14px 0 6px; }
    .detail-body h4 { font-size: 1em; margin: 12px 0 4px; }
    .detail-body p { margin: 8px 0; }
    .detail-body ul, .detail-body ol { margin: 8px 0; padding-left: 24px; }
    .detail-body li { margin: 4px 0; }
    .detail-body pre {
      background: var(--input-bg); border: 1px solid var(--border);
      border-radius: 4px; padding: 12px; overflow-x: auto;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em; margin: 10px 0;
    }
    .detail-body code {
      background: var(--input-bg); padding: 1px 4px; border-radius: 3px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
    }
    .detail-body pre code { background: none; padding: 0; }
    .detail-body blockquote {
      border-left: 3px solid var(--btn-bg); margin: 10px 0;
      padding: 4px 16px; color: var(--desc-fg);
    }
    .detail-body hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
    .detail-body a { color: var(--vscode-textLink-foreground, #4fc1ff); }
    .detail-body table { border-collapse: collapse; margin: 10px 0; width: 100%; }
    .detail-body th, .detail-body td {
      border: 1px solid var(--border); padding: 6px 10px; text-align: left;
    }
    .detail-body th { background: var(--input-bg); font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>\u{1F6D2} ${t.title}</h1>
    <div class="header-row">
      <input type="text" class="search-box" id="searchBox" placeholder="${t.searchPlaceholder}" />
      <button class="header-btn primary" id="refreshBtn">\u{21BB} ${t.refreshBtn}</button>
      <button class="header-btn" id="addSourceBtn">+ ${t.addSourceBtn}</button>
      <span class="stats" id="stats"></span>
    </div>
  </div>

  <div class="source-filters" id="sourceFilters"></div>
  <div class="source-bar" id="sourceBar"></div>

  <div class="content list-view" id="listView">
    <div class="loading-state" id="loadingState">
      <div class="spinner"></div>
      <h2>${t.loading}</h2>
    </div>
    <ul class="skill-list" id="skillList" style="display:none"></ul>
    <div class="empty-state" id="emptyState" style="display:none">
      <h2>${t.noSkillsFound}</h2>
      <p>${t.noSkillsHint}</p>
    </div>
  </div>

  <!-- Detail / Preview View -->
  <div class="detail-view" id="detailView">
    <div class="detail-header">
      <button class="back-btn" id="backBtn">\u2190 ${t.backBtn}</button>
      <span class="detail-title" id="detailTitle"></span>
      <div class="skill-actions">
        <button class="install-btn" id="detailInstallBtn">${t.installBtn}</button>
      </div>
    </div>
    <div class="detail-meta-bar" id="detailMeta"></div>
    <div class="detail-body" id="detailBody">
      <p>${t.previewLoadingBody}</p>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const loc = ${JSON.stringify({
      installBtn: t.installBtn,
      installedLabel: t.installedLabel,
      updateBtn: t.updateBtn,
      removeSourceBtn: t.removeSourceBtn,
      skillUnit: t.skillUnit,
      sourceLabel: t.sourceLabel,
      allSources: t.allSources,
      backBtn: t.backBtn,
      selectAll: t.selectAll,
      deselectAll: t.deselectAll,
    })};

    let allSkills = [];
    let allSources = [];
    let installedSet = new Set();
    let hasUpdateMap = {};
    let activeSourceIds = new Set();
    let searchQuery = '';

    const searchBox      = document.getElementById('searchBox');
    const sourceFilters  = document.getElementById('sourceFilters');
    const refreshBtn     = document.getElementById('refreshBtn');
    const addSourceBtn   = document.getElementById('addSourceBtn');
    const skillList      = document.getElementById('skillList');
    const emptyState     = document.getElementById('emptyState');
    const loadingState   = document.getElementById('loadingState');
    const statsEl        = document.getElementById('stats');
    const sourceBar      = document.getElementById('sourceBar');
    const listView       = document.getElementById('listView');
    const detailView     = document.getElementById('detailView');
    const detailTitle    = document.getElementById('detailTitle');
    const detailMeta     = document.getElementById('detailMeta');
    const detailBody     = document.getElementById('detailBody');
    const detailInstallBtn = document.getElementById('detailInstallBtn');
    const backBtn        = document.getElementById('backBtn');

    var currentPreviewSkill = null;

    // Tell extension we're ready
    vscode.postMessage({ command: 'ready' });

    // ---- Event listeners ----
    let searchTimer;
    searchBox.addEventListener('input', function() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function() {
        searchQuery = searchBox.value.trim().toLowerCase();
        renderSkills();
      }, 200);
    });

    refreshBtn.addEventListener('click', function() {
      vscode.postMessage({ command: 'refresh' });
    });

    addSourceBtn.addEventListener('click', function() {
      vscode.postMessage({ command: 'addSource' });
    });

    backBtn.addEventListener('click', function() {
      hideDetail();
    });

    detailInstallBtn.addEventListener('click', function() {
      if (!currentPreviewSkill || detailInstallBtn.classList.contains('installed')) return;
      vscode.postMessage({
        command: 'install',
        sourceId: currentPreviewSkill.sourceId,
        repoPath: currentPreviewSkill.repoPath,
      });
    });

    // ---- Messages from extension ----
    window.addEventListener('message', function(event) {
      var msg = event.data;
      switch (msg.command) {
        case 'loading':
          loadingState.style.display = 'block';
          skillList.style.display = 'none';
          emptyState.style.display = 'none';
          break;
        case 'updateSkills':
          var prevSourceIds = new Set(allSources.map(function(s) { return s.id; }));
          allSkills = msg.skills;
          allSources = msg.sources;
          installedSet = new Set(msg.skills.filter(function(s) { return s.installed; }).map(function(s) { return s.id; }));
          hasUpdateMap = {};
          msg.skills.forEach(function(s) { if (s.hasUpdate) { hasUpdateMap[s.id] = true; } });
          // Sync activeSourceIds: auto-activate new sources, prune removed ones
          var newSourceIds = new Set(allSources.map(function(s) { return s.id; }));
          if (activeSourceIds.size === 0 && prevSourceIds.size === 0) {
            // First load — activate all
            allSources.forEach(function(s) { activeSourceIds.add(s.id); });
          } else {
            // Activate any newly added sources
            allSources.forEach(function(s) {
              if (!prevSourceIds.has(s.id)) { activeSourceIds.add(s.id); }
            });
            // Remove stale source IDs
            activeSourceIds.forEach(function(id) {
              if (!newSourceIds.has(id)) { activeSourceIds.delete(id); }
            });
          }
          renderSourceFilters();
          renderSourceBar();
          renderSkills();
          break;
        case 'updateInstalled':
          installedSet = new Set(msg.installedIds);
          if (msg.hasUpdateMap) { hasUpdateMap = msg.hasUpdateMap; }
          renderSkills();
          // Also update detail view install button if open
          if (currentPreviewSkill) {
            updateDetailInstallBtn(installedSet.has(currentPreviewSkill.id));
          }
          break;
        case 'showPreview':
          showDetail(msg.skill);
          break;
        case 'filterSource':
          applySourceFilter(msg.sourceId);
          break;
      }
    });

    function renderSourceFilters() {
      var allActive = allSources.length > 0 && activeSourceIds.size === allSources.length;
      var toggleLabel = allActive ? loc.deselectAll : loc.selectAll;
      var toggleHtml = '<button class="toggle-all-btn" id="toggleAllSources">' + escapeHtml(toggleLabel) + '</button>';

      var chipsHtml = allSources.map(function(s) {
        var isActive = activeSourceIds.has(s.id);
        return '<span class="source-filter-chip' + (isActive ? ' active' : '') + '" data-source-id="' + escapeHtml(s.id) + '">' +
          '<span class="chip-check">' + (isActive ? '\u2713' : '') + '</span>' +
          escapeHtml(s.label) +
        '</span>';
      }).join('');

      sourceFilters.innerHTML = toggleHtml + chipsHtml;

      document.getElementById('toggleAllSources').addEventListener('click', function() {
        if (activeSourceIds.size === allSources.length) {
          activeSourceIds.clear();
        } else {
          allSources.forEach(function(s) { activeSourceIds.add(s.id); });
        }
        renderSourceFilters();
        renderSkills();
      });

      sourceFilters.querySelectorAll('.source-filter-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
          var id = chip.getAttribute('data-source-id');
          if (!id) return;
          if (activeSourceIds.has(id)) {
            activeSourceIds.delete(id);
          } else {
            activeSourceIds.add(id);
          }
          renderSourceFilters();
          renderSkills();
        });
      });
    }

    function applySourceFilter(sourceId) {
      // If in detail view, go back to list first
      if (currentPreviewSkill) { hideDetail(); }
      activeSourceIds.clear();
      activeSourceIds.add(sourceId);
      renderSourceFilters();
      renderSkills();
    }

    function renderSourceBar() {
      var custom = allSources.filter(function(s) { return !s.isBuiltin; });
      if (custom.length === 0) {
        sourceBar.style.display = 'none';
        return;
      }
      sourceBar.style.display = 'flex';
      sourceBar.innerHTML = custom.map(function(s) {
        return '<span class="source-chip">' +
          escapeHtml(s.label) +
          ' <button class="remove-src" data-source-id="'+escapeHtml(s.id)+'" title="'+escapeHtml(loc.removeSourceBtn)+'">\u00D7</button>' +
        '</span>';
      }).join('');

      sourceBar.querySelectorAll('.remove-src').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = btn.getAttribute('data-source-id');
          if (id) vscode.postMessage({ command: 'removeSource', sourceId: id });
        });
      });
    }

    function renderSkills() {
      loadingState.style.display = 'none';

      var filtered = allSkills;
      if (activeSourceIds.size > 0 && activeSourceIds.size < allSources.length) {
        filtered = filtered.filter(function(s) { return activeSourceIds.has(s.sourceId); });
      } else if (activeSourceIds.size === 0) {
        filtered = [];
      }
      if (searchQuery) {
        filtered = filtered.filter(function(s) {
          return s.name.toLowerCase().indexOf(searchQuery) !== -1
            || s.description.toLowerCase().indexOf(searchQuery) !== -1
            || (s.tags || []).some(function(t) { return t.toLowerCase().indexOf(searchQuery) !== -1; })
            || s.id.toLowerCase().indexOf(searchQuery) !== -1;
        });
      }

      statsEl.textContent = filtered.length + ' ' + loc.skillUnit;

      if (filtered.length === 0) {
        skillList.style.display = 'none';
        emptyState.style.display = 'block';
        return;
      }

      emptyState.style.display = 'none';
      skillList.style.display = 'block';

      skillList.innerHTML = filtered.map(function(skill) {
        var isInstalled = installedSet.has(skill.id);
        var needsUpdate = !!hasUpdateMap[skill.id];
        var tags = (skill.tags || []).map(function(t) {
          return '<span class="tag">' + escapeHtml(t) + '</span>';
        }).join('');

        var meta = [
          skill.author ? 'by ' + escapeHtml(skill.author) : '',
          skill.version ? 'v' + escapeHtml(skill.version) : '',
        ].filter(Boolean).join(' \u00B7 ');

        var btnClass = isInstalled ? 'install-btn installed' : 'install-btn';
        var btnText = isInstalled ? '\u2713 ' + escapeHtml(loc.installedLabel) : escapeHtml(loc.installBtn);

        var updateBtnHtml = needsUpdate
          ? '<button class="update-btn"' +
              ' data-source-id="' + escapeHtml(skill.sourceId) + '"' +
              ' data-repo-path="' + escapeHtml(skill.repoPath) + '"' +
            '>' + escapeHtml(loc.updateBtn) + '</button>'
          : '';

        return '<li class="skill-item"' +
          ' data-source-id="' + escapeHtml(skill.sourceId) + '"' +
          ' data-repo-path="' + escapeHtml(skill.repoPath) + '">' +
          '<div class="skill-icon">\u2726</div>' +
          '<div class="skill-info">' +
            '<div class="skill-name">' + escapeHtml(skill.name) + '</div>' +
            '<div class="skill-desc">' + escapeHtml(skill.description) + '</div>' +
            '<div class="skill-meta">' +
              '<span class="source-tag"><span class="repo-icon">\u{1F4E6}</span> ' + escapeHtml(skill.sourceLabel) + '</span>' +
              (meta ? '<span style="font-size:0.8em;opacity:0.7">' + meta + '</span>' : '') +
              tags +
            '</div>' +
          '</div>' +
          '<div class="skill-actions">' +
            '<button class="' + btnClass + '"' +
              ' data-source-id="' + escapeHtml(skill.sourceId) + '"' +
              ' data-repo-path="' + escapeHtml(skill.repoPath) + '"' +
              (isInstalled ? ' disabled' : '') +
            '>' + btnText + '</button>' +
            updateBtnHtml +
          '</div>' +
        '</li>';
      }).join('');

      // Delegated event binding
      skillList.querySelectorAll('.skill-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          // Don't trigger preview when clicking action buttons or checkboxes
          if (e.target.closest('.skill-actions')) return;
          var sourceId = item.getAttribute('data-source-id');
          var repoPath = item.getAttribute('data-repo-path');
          if (sourceId && repoPath) {
            vscode.postMessage({ command: 'preview', sourceId: sourceId, repoPath: repoPath });
          }
        });
      });

      skillList.querySelectorAll('.install-btn:not(.installed)').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var sourceId = btn.getAttribute('data-source-id');
          var repoPath = btn.getAttribute('data-repo-path');
          if (sourceId && repoPath) {
            vscode.postMessage({ command: 'install', sourceId: sourceId, repoPath: repoPath });
          }
        });
      });

      skillList.querySelectorAll('.update-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var sourceId = btn.getAttribute('data-source-id');
          var repoPath = btn.getAttribute('data-repo-path');
          if (sourceId && repoPath) {
            vscode.postMessage({ command: 'update', sourceId: sourceId, repoPath: repoPath });
          }
        });
      });

    }

    function showDetail(skill) {
      currentPreviewSkill = skill;

      // Hide list, show detail
      document.querySelector('.header').style.display = 'none';
      document.querySelector('.source-filters').style.display = 'none';
      sourceBar.style.display = 'none';
      listView.classList.add('hidden');
      detailView.classList.add('active');

      // Title
      detailTitle.textContent = skill.name;

      // Install button state
      updateDetailInstallBtn(skill.installed || installedSet.has(skill.id));

      // Meta bar
      var metaParts = [];
      if (skill.sourceLabel) {
        metaParts.push('<span class="detail-meta-item"><span class="repo-icon">\u{1F4E6}</span> <strong>' + escapeHtml(skill.sourceLabel) + '</strong></span>');
      }
      if (skill.author) {
        metaParts.push('<span class="detail-meta-item">\u{1F464} ' + escapeHtml(skill.author) + '</span>');
      }
      if (skill.version) {
        metaParts.push('<span class="detail-meta-item">v' + escapeHtml(skill.version) + '</span>');
      }
      if (skill.license) {
        metaParts.push('<span class="detail-meta-item">\u{1F4DC} ' + escapeHtml(skill.license) + '</span>');
      }
      if (skill.tags && skill.tags.length > 0) {
        metaParts.push('<span class="detail-tags">' +
          skill.tags.map(function(t) { return '<span class="tag">' + escapeHtml(t) + '</span>'; }).join('') +
        '</span>');
      }
      detailMeta.innerHTML = metaParts.join('');

      // Render body markdown
      detailBody.innerHTML = skill.bodyHtml || '';
    }

    function hideDetail() {
      currentPreviewSkill = null;
      detailView.classList.remove('active');
      listView.classList.remove('hidden');
      document.querySelector('.header').style.display = '';
      document.querySelector('.source-filters').style.display = '';
      // sourceBar visibility handled by renderSourceBar
      renderSourceBar();
    }

    function updateDetailInstallBtn(isInstalled) {
      if (isInstalled) {
        detailInstallBtn.className = 'install-btn installed';
        detailInstallBtn.textContent = '\u2713 ' + loc.installedLabel;
        detailInstallBtn.disabled = true;
      } else {
        detailInstallBtn.className = 'install-btn';
        detailInstallBtn.textContent = loc.installBtn;
        detailInstallBtn.disabled = false;
      }
    }

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
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

// ------------------------------------------------------------------
// Minimal Markdown → HTML converter (runs on extension side)
// ------------------------------------------------------------------
export function escapeHtmlStr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function markdownToHtml(md: string): string {
  let html = escapeHtmlStr(md);

  // Fenced code blocks: ```lang\n...\n```
  html = html.replace(/`{3}(\w*)\n([\s\S]*?)`{3}/g, (_m, _lang, code) => {
    return `<pre><code>${code.replace(/\n$/, '')}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings (process longest first)
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  html = html.replace(/^[-*_]{3,}$/gm, '<hr>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Blockquotes
  html = html.replace(/^&gt; ?(.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered list items
  html = html.replace(/^[ \t]*[-*+] (.+)$/gm, '<li>$1</li>');
  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);

  // Paragraphs: wrap remaining loose text lines
  html = html.replace(/^(?!<[a-z/])(\S.+)$/gm, '<p>$1</p>');

  // Clean up extra blank lines
  html = html.replace(/\n{3,}/g, '\n\n');

  return html;
}
