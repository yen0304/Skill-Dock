import * as vscode from 'vscode';
import { MarketplaceService } from '../services/marketplaceService';
import { SkillsRegistryService, RegistrySkillEntry } from '../services/skillsRegistryService';

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
    loadingFile: vscode.l10n.t('Loading file...'),
    loadError: vscode.l10n.t('Failed to load marketplace'),
    registryTab: vscode.l10n.t('skills.sh'),
    sourcesTab: vscode.l10n.t('Sources'),
    registrySearchPlaceholder: vscode.l10n.t('Search the skills.sh ecosystem...'),
    registryHint: vscode.l10n.t('Search the open agent skills ecosystem powered by skills.sh. Discover skills from thousands of community repositories.'),
    registryInstalls: vscode.l10n.t('installs'),
    registryInstallToLibrary: vscode.l10n.t('Add to Library'),
    registrySearching: vscode.l10n.t('Searching skills.sh...'),
    registryNoResults: vscode.l10n.t('No skills found. Try a different search query.'),
    registryMinChars: vscode.l10n.t('Type at least 2 characters to search.'),
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
    private registryService: SkillsRegistryService,
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
          case 'previewFile':
            await this._handlePreviewFile(msg.sourceId, msg.repoPath, msg.filePath);
            break;
          case 'addSource':
            await this._handleAddSource();
            break;
          case 'removeSource':
            await this._handleRemoveSource(msg.sourceId);
            break;
          case 'searchRegistry':
            await this._handleSearchRegistry(msg.query);
            break;
          case 'installFromRegistry':
            await this._handleInstallFromRegistry(msg.entry);
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
    registryService: SkillsRegistryService,
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
      registryService,
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
    const LOAD_TIMEOUT_MS = 60_000; // 60s safety net

    try {
      this._postMessage({ command: 'loading' });

      const fetchPromise = Promise.all([
        this.marketplaceService.fetchAll(force),
        this.marketplaceService.getInstalledIds(),
        this.marketplaceService.getInstalledVersionMap(),
      ]);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(vscode.l10n.t('Loading timed out. Check your network connection or set a GitHub Token to increase rate limits.'))),
          LOAD_TIMEOUT_MS,
        ),
      );

      const [skills, installedIds, installedVersions] = await Promise.race([fetchPromise, timeoutPromise]);

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
            additionalFilesCount: s.additionalFiles?.length || 0,
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
      const errStr = String(err instanceof Error ? err.message : err);
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to load marketplace: {0}', errStr)
      );
      this._postMessage({ command: 'loadError', error: errStr });
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
      const errMsg = vscode.l10n.t('Install failed: {0}', String(err));
      vscode.window.showErrorMessage(errMsg);
      this._postMessage({ command: 'toast', message: errMsg, type: 'error' });
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
      const errMsg = vscode.l10n.t('Install failed: {0}', String(err));
      vscode.window.showErrorMessage(errMsg);
      this._postMessage({ command: 'toast', message: errMsg, type: 'error' });
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
          additionalFiles: skill.additionalFiles?.map((f) => f.relativePath) || [],
        },
      });
    } catch (err) {
      const errMsg = vscode.l10n.t('Failed to preview skill: {0}', String(err));
      vscode.window.showErrorMessage(errMsg);
      this._postMessage({ command: 'toast', message: errMsg, type: 'error' });
    }
  }

  private async _handlePreviewFile(sourceId: string, repoPath: string, filePath: string): Promise<void> {
    try {
      const skills = await this.marketplaceService.fetchAll(false);
      const skill = skills.find(
        (s) => s.source.id === sourceId && s.repoPath === repoPath
      );
      if (!skill?.additionalFiles) { return; }

      const file = skill.additionalFiles.find((f) => f.relativePath === filePath);
      if (!file) { return; }

      const content = file.content
        ?? await this.marketplaceService.fetchFileContent(file.downloadUrl ?? '');

      const isMarkdown = /\.md$/i.test(filePath);
      this._postMessage({
        command: 'showFilePreview',
        fileName: filePath,
        content: isMarkdown ? markdownToHtml(content) : content,
        isMarkdown,
      });
    } catch (err) {
      const errMsg = vscode.l10n.t('Failed to load file: {0}', String(err));
      vscode.window.showErrorMessage(errMsg);
      this._postMessage({ command: 'toast', message: errMsg, type: 'error' });
    }
  }

  private async _handleSearchRegistry(query: string): Promise<void> {
    try {
      this._postMessage({ command: 'registrySearching' });
      const result = await this.registryService.search(query, 30);
      this._postMessage({
        command: 'registryResults',
        skills: result.skills.map((s) => ({
          id: s.id,
          skillId: s.skillId,
          name: s.name,
          installs: s.installs,
          source: s.source,
          installsLabel: SkillsRegistryService.formatInstalls(s.installs),
        })),
      });
    } catch (err) {
      const errMsg = vscode.l10n.t('skills.sh search failed: {0}', String(err));
      this._postMessage({ command: 'registryResults', skills: [], error: errMsg });
    }
  }

  private async _handleInstallFromRegistry(entry: RegistrySkillEntry): Promise<void> {
    try {
      this._postMessage({ command: 'registryInstalling', skillId: entry.skillId });
      await this.registryService.installFromRegistry(entry);
      this.onRefresh();

      vscode.window.showInformationMessage(
        vscode.l10n.t('Installed "{0}" to your library.', entry.name)
      );

      this._postMessage({ command: 'registryInstalled', skillId: entry.skillId });

      // Also refresh the "Sources" tab installed state
      const installedIds = await this.marketplaceService.getInstalledIds();
      const installedVersions = await this.marketplaceService.getInstalledVersionMap();
      const skills = await this.marketplaceService.fetchAll(false).catch(() => [] as import('../models/skill').RemoteSkill[]);
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
      const errMsg = vscode.l10n.t('Install failed: {0}', String(err));
      vscode.window.showErrorMessage(errMsg);
      this._postMessage({ command: 'registryInstallFailed', skillId: entry.skillId, error: errMsg });
      this._postMessage({ command: 'toast', message: errMsg, type: 'error' });
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
      this._postMessage({ command: 'toast', message: String(err), type: 'error' });
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
      this._postMessage({ command: 'toast', message: String(err), type: 'error' });
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
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
    .hidden-initial { display: none; }
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
    .detail-view { display: none; flex-direction: column; height: 100%; }
    .detail-view.active { display: flex; }
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
      flex: 1; min-width: 0;
      padding: 20px 24px; line-height: 1.7;
      overflow-wrap: break-word; word-break: break-word;
      overflow-y: auto;
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

    /* File count badge on skill cards */
    .files-badge {
      font-size: 0.72em; padding: 2px 7px;
      background: var(--input-bg); color: var(--desc-fg);
      border: 1px solid var(--border); border-radius: 10px;
      display: inline-flex; align-items: center; gap: 3px;
    }

    /* ---- Detail workspace: file explorer + content ---- */
    .detail-workspace {
      display: flex; flex: 1; min-height: 0; overflow: hidden;
    }
    .file-explorer {
      width: 220px; min-width: 180px; max-width: 300px;
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      background: color-mix(in srgb, var(--bg) 92%, var(--fg) 8%);
      overflow-y: auto; flex-shrink: 0;
    }
    .file-explorer.hidden { display: none; }
    .explorer-title {
      padding: 10px 14px; font-size: 0.75em;
      text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--desc-fg); font-weight: 600;
      border-bottom: 1px solid var(--border);
      user-select: none;
    }
    .file-tree { list-style: none; margin: 0; padding: 4px 0; }
    .file-tree-item {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 14px; cursor: pointer;
      font-size: 0.85em; color: var(--desc-fg);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      border-left: 2px solid transparent;
      transition: background 0.1s, color 0.1s;
    }
    .file-tree-item:hover {
      background: color-mix(in srgb, var(--bg) 80%, var(--fg) 20%);
      color: var(--fg);
    }
    .file-tree-item.active {
      background: color-mix(in srgb, var(--btn-bg) 18%, var(--bg) 82%);
      color: var(--fg); font-weight: 500;
      border-left-color: var(--btn-bg);
    }
    .file-tree-icon { opacity: 0.7; font-size: 0.95em; flex-shrink: 0; }
    .file-tree-item.active .file-tree-icon { opacity: 1; }
    .file-tree-name { overflow: hidden; text-overflow: ellipsis; }
    .file-loading {
      text-align: center; padding: 60px 24px; color: var(--desc-fg);
    }

    /* ---- Syntax highlighting tokens ---- */
    .code-view { position: relative; }
    .code-view pre {
      background: var(--input-bg); border: 1px solid var(--border);
      border-radius: 4px; padding: 12px; overflow-x: auto;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em; margin: 0; line-height: 1.6;
    }
    .code-lang-badge {
      position: absolute; top: 6px; right: 10px;
      font-size: 0.7em; padding: 2px 8px;
      background: var(--border); color: var(--desc-fg);
      border-radius: 3px; text-transform: uppercase;
      pointer-events: none; user-select: none;
    }
    .hl-kw   { color: var(--vscode-symbolIcon-keywordForeground, #c586c0); }
    .hl-str  { color: var(--vscode-symbolIcon-stringForeground, #ce9178); }
    .hl-num  { color: var(--vscode-symbolIcon-numberForeground, #b5cea8); }
    .hl-cm   { color: var(--vscode-symbolIcon-commentForeground, #6a9955); font-style: italic; }
    .hl-fn   { color: var(--vscode-symbolIcon-functionForeground, #dcdcaa); }
    .hl-tag  { color: var(--vscode-symbolIcon-keywordForeground, #569cd6); }
    .hl-attr { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); }
    .hl-val  { color: var(--vscode-symbolIcon-stringForeground, #ce9178); }
    .hl-op   { color: var(--vscode-symbolIcon-operatorForeground, #d4d4d4); }
    .hl-type { color: var(--vscode-symbolIcon-typeParameterForeground, #4ec9b0); }

    /* ---- Toast notifications ---- */
    .toast-container {
      position: fixed; bottom: 16px; right: 16px;
      z-index: 9999; display: flex; flex-direction: column-reverse;
      gap: 8px; max-width: 420px; pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex; align-items: flex-start; gap: 8px;
      padding: 10px 14px; border-radius: 6px;
      font-size: 0.85em; line-height: 1.4;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: toastIn 0.25s ease-out;
      word-break: break-word;
    }
    .toast.fade-out { animation: toastOut 0.3s ease-in forwards; }
    .toast-error {
      background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
      color: var(--vscode-errorForeground, #f48771);
    }
    .toast-info {
      background: var(--vscode-inputValidation-infoBackground, #063b49);
      border: 1px solid var(--vscode-inputValidation-infoBorder, #007acc);
      color: var(--fg);
    }
    .toast-icon { flex-shrink: 0; font-size: 1.1em; margin-top: 1px; }
    .toast-msg { flex: 1; }
    .toast-close {
      flex-shrink: 0; background: none; border: none;
      color: inherit; cursor: pointer; font-size: 1em;
      padding: 0 2px; opacity: 0.6;
    }
    .toast-close:hover { opacity: 1; }
    @keyframes toastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes toastOut { from { opacity: 1; } to { opacity: 0; transform: translateY(8px); } }

    /* ---- Error state ---- */
    .error-state {
      text-align: center; padding: 60px 24px;
      color: var(--desc-fg); display: none;
    }
    .error-state h2 { color: var(--vscode-errorForeground, #f48771); margin-bottom: 8px; }
    .error-state .error-detail {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em; background: var(--input-bg);
      border: 1px solid var(--border); border-radius: 4px;
      padding: 10px 14px; margin: 12px auto; max-width: 600px;
      text-align: left; word-break: break-all;
    }
    .error-state .retry-btn {
      margin-top: 12px; padding: 6px 16px;
      background: var(--btn-bg); color: var(--btn-fg);
      border: none; border-radius: 4px; cursor: pointer;
      font-family: inherit; font-size: 0.9em;
    }
    .error-state .retry-btn:hover { opacity: 0.9; }

    /* ---- Tab bar ---- */
    .tab-bar {
      display: flex; border-bottom: 1px solid var(--border);
      padding: 0 24px; background: color-mix(in srgb, var(--bg) 95%, var(--fg) 5%);
    }
    .tab-btn {
      padding: 10px 18px; border: none; border-bottom: 2px solid transparent;
      background: none; color: var(--desc-fg);
      font-family: inherit; font-size: 0.9em; font-weight: 500;
      cursor: pointer; transition: all 0.15s;
    }
    .tab-btn:hover { color: var(--fg); }
    .tab-btn.active {
      color: var(--fg); border-bottom-color: var(--btn-bg);
    }
    .tab-btn .tab-badge {
      font-size: 0.75em; padding: 1px 6px; margin-left: 5px;
      background: var(--badge-bg); color: var(--badge-fg);
      border-radius: 10px; vertical-align: middle;
    }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    /* ---- skills.sh registry panel ---- */
    .registry-panel { padding: 0; }
    .registry-search-header {
      padding: 20px 24px 16px; border-bottom: 1px solid var(--border);
    }
    .registry-search-header h2 {
      font-size: 1.2em; font-weight: 600; margin-bottom: 8px;
      display: flex; align-items: center; gap: 8px;
    }
    .registry-search-header .registry-hint {
      font-size: 0.85em; color: var(--desc-fg); margin-bottom: 12px; line-height: 1.5;
    }
    .registry-search-row {
      display: flex; gap: 8px; align-items: center;
    }
    .registry-search-box {
      flex: 1; min-width: 200px;
      padding: 8px 12px;
      background: var(--input-bg); color: var(--input-fg);
      border: 1px solid var(--input-border); border-radius: 4px;
      font-family: inherit; font-size: inherit;
    }
    .registry-search-box:focus { outline: none; border-color: var(--focus); }
    .registry-results-list { list-style: none; }
    .registry-skill-item {
      display: flex; align-items: center;
      padding: 14px 24px; border-bottom: 1px solid var(--border);
      transition: background 0.1s;
    }
    .registry-skill-item:hover { background: var(--list-hover); }
    .registry-skill-icon {
      width: 38px; height: 38px;
      background: var(--badge-bg); color: var(--badge-fg);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.2em; margin-right: 14px; flex-shrink: 0;
    }
    .registry-skill-info { flex: 1; min-width: 0; }
    .registry-skill-name { font-weight: 600; margin-bottom: 2px; }
    .registry-skill-source {
      font-size: 0.82em; color: var(--desc-fg);
      display: flex; align-items: center; gap: 4px;
    }
    .registry-installs-badge {
      font-size: 0.75em; padding: 2px 8px;
      background: color-mix(in srgb, var(--btn-bg) 15%, var(--bg) 85%);
      color: var(--btn-bg); border-radius: 10px; font-weight: 600;
      white-space: nowrap;
    }
    .registry-skill-actions { flex-shrink: 0; margin-left: 12px; }
    .registry-install-btn {
      padding: 5px 14px; border: none; border-radius: 4px; cursor: pointer;
      font-family: inherit; font-size: 0.85em;
      background: var(--btn-bg); color: var(--btn-fg);
    }
    .registry-install-btn:hover { background: var(--btn-hover); }
    .registry-install-btn.installed {
      background: transparent; color: var(--success-fg);
      cursor: default; font-weight: 600;
    }
    .registry-install-btn.loading {
      opacity: 0.6; cursor: wait;
    }
    .registry-empty {
      text-align: center; padding: 60px 24px; color: var(--desc-fg);
    }
    .registry-empty h3 { font-weight: 500; margin-bottom: 6px; }
    .powered-by {
      font-size: 0.75em; color: var(--desc-fg); padding: 12px 24px;
      text-align: center; border-top: 1px solid var(--border);
    }
    .powered-by a { color: var(--vscode-textLink-foreground, #4fc1ff); text-decoration: none; }
    .powered-by a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <!-- Tab bar -->
  <div class="tab-bar">
    <button class="tab-btn active" data-tab="sources"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>${t.sourcesTab}</button>
    <button class="tab-btn" data-tab="registry"><svg width="12" height="12" viewBox="0 0 76 65" fill="currentColor" style="vertical-align:-1px;margin-right:4px"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/></svg>${t.registryTab}</button>
  </div>

  <!-- Tab: Sources (existing marketplace) -->
  <div class="tab-panel active" id="sourcesPanel">
  <div class="header">
    <h1><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>${t.title}</h1>
    <div class="header-row">
      <input type="text" class="search-box" id="searchBox" placeholder="${t.searchPlaceholder}" />
      <button class="header-btn primary" id="refreshBtn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>${t.refreshBtn}</button>
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
    <ul class="skill-list hidden-initial" id="skillList"></ul>
    <div class="empty-state hidden-initial" id="emptyState">
      <h2>${t.noSkillsFound}</h2>
      <p>${t.noSkillsHint}</p>
    </div>
    <div class="error-state" id="errorState">
      <h2><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;color:var(--vscode-editorWarning-foreground,#cca700)"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>${t.loadError}</h2>
      <div class="error-detail" id="errorDetail"></div>
      <button class="retry-btn" id="retryBtn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>${t.refreshBtn}</button>
    </div>
  </div>
  <div class="toast-container" id="toastContainer"></div>
  </div><!-- end sourcesPanel -->

  <!-- Tab: skills.sh Registry -->
  <div class="tab-panel" id="registryPanel">
    <div class="registry-search-header">
      <h2><svg width="18" height="18" viewBox="0 0 76 65" fill="currentColor" style="vertical-align:-2px;margin-right:6px"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/></svg>${t.registryTab} <span style="font-size:0.6em;font-weight:normal;color:var(--desc-fg)">— skills.sh</span></h2>
      <p class="registry-hint">${t.registryHint}</p>
      <div class="registry-search-row">
        <input type="text" class="registry-search-box" id="registrySearchBox" placeholder="${t.registrySearchPlaceholder}" />
      </div>
    </div>
    <div id="registryContent">
      <div class="registry-empty" id="registryInitial">
        <h3><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px;margin-right:4px"><path d="M12 2l2.09 6.26L20.18 9l-5 4.09L16.82 20 12 16.54 7.18 20l1.64-6.91L3.82 9l6.09-.74z"/></svg>${t.registryMinChars}</h3>
      </div>
      <div class="registry-empty hidden-initial" id="registrySearching">
        <div class="spinner"></div>
        <h3>${t.registrySearching}</h3>
      </div>
      <div class="registry-empty hidden-initial" id="registryNoResults">
        <h3>${t.registryNoResults}</h3>
      </div>
      <ul class="registry-results-list hidden-initial" id="registryResultsList"></ul>
    </div>
    <div class="powered-by"><svg width="11" height="11" viewBox="0 0 76 65" fill="currentColor" style="vertical-align:-1px;margin-right:3px"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/></svg>Powered by <a href="https://skills.sh" target="_blank">skills.sh</a> — the open agent skills ecosystem</div>
  </div><!-- end registryPanel -->

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
    <div class="detail-workspace">
      <div class="file-explorer hidden" id="fileExplorer">
        <div class="explorer-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>Files</div>
        <ul class="file-tree" id="fileTree"></ul>
      </div>
      <div class="detail-body" id="detailBody">
        <p>${t.previewLoadingBody}</p>
      </div>
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
      loadingFile: t.loadingFile,
      registryInstallToLibrary: t.registryInstallToLibrary,
      registryInstalls: t.registryInstalls,
    })};

    let allSkills = [];
    let allSources = [];
    let installedSet = new Set();
    let hasUpdateMap = {};
    let activeSourceIds = new Set();
    let searchQuery = '';

    // SVG icon constants (avoids emoji rendering issues)
    var svgPackage = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
    var svgClip = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>';
    var svgChart = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';
    var svgUser = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    var svgLicense = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13\" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
    var svgFileDoc = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    var svgGear = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
    var svgEdit = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

    // Source brand SVG icons (20x20, used as skill-icon in list)
    var svgAnthropic = '<svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor"><path d="M151.441 37.198h30.321l54.24 181.605h-30.321L151.44 37.198zM95.79 37.198h31.673l55.381 181.605h-30.953l-12.468-37.139H83.61l-12.53 37.14H40.41L95.79 37.197zm6.394 112.545h37.293l-18.614-55.606-18.679 55.606z"/></svg>';
    var svgOpenAI = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 004.981 4.18a5.998 5.998 0 00-3.998 2.9 6.042 6.042 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.26 24a6.056 6.056 0 005.772-4.206 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.747-7.073zM13.26 22.43a4.476 4.476 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.6 18.304a4.47 4.47 0 01-.535-3.014l.142.085 4.783 2.759a.771.771 0 00.78 0l5.843-3.369v2.332a.08.08 0 01-.033.062L9.74 19.95a4.5 4.5 0 01-6.14-1.646zM2.34 7.896a4.485 4.485 0 012.366-1.973V11.6a.766.766 0 00.388.676l5.815 3.355-2.02 1.168a.076.076 0 01-.071 0l-4.83-2.786A4.504 4.504 0 012.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 01.071 0l4.83 2.791a4.494 4.494 0 01-.676 8.105v-5.678a.79.79 0 00-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 00-.785 0L9.409 9.23V6.897a.066.066 0 01.028-.061l4.83-2.787a4.5 4.5 0 016.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 01-.038-.057V6.075a4.5 4.5 0 017.375-3.453l-.142.08L8.704 5.46a.795.795 0 00-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>';
    var svgGitHub = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>';
    var svgHuggingFace = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M16.781 3.277c2.997 1.704 4.844 4.851 4.844 8.258 0 .995-.155 1.955-.443 2.857a1.332 1.332 0 011.125.4 1.41 1.41 0 01.2 1.723c.204.165.352.385.428.632l.017.062c.06.222.12.69-.2 1.166.244.37.279.836.093 1.236-.255.57-.893 1.018-2.128 1.5l-.202.078-.131.048c-.478.173-.89.295-1.061.345l-.086.024c-.89.243-1.808.375-2.732.394-1.32 0-2.3-.36-2.923-1.067a9.852 9.852 0 01-3.18.018C9.778 21.647 8.802 22 7.494 22a11.249 11.249 0 01-2.541-.343l-.221-.06-.273-.08a16.574 16.574 0 01-1.175-.405c-1.237-.483-1.875-.93-2.13-1.501-.186-.4-.151-.867.093-1.236a1.42 1.42 0 01-.2-1.166c.069-.273.226-.516.447-.694a1.41 1.41 0 01.2-1.722c.233-.248.557-.391.917-.407l.078-.001a9.385 9.385 0 01-.44-2.85c0-3.407 1.847-6.554 4.844-8.258a9.822 9.822 0 019.687 0zM4.188 14.758c.125.687 2.357 2.35 2.14 2.707-.19.315-.796-.239-.948-.386l-.041-.04-.168-.147c-.561-.479-2.304-1.9-2.74-1.432-.43.46.119.859 1.055 1.42l.784.467.136.083c1.045.643 1.12.84.95 1.113-.188.295-3.07-2.1-3.34-1.083-.27 1.011 2.942 1.304 2.744 2.006-.2.7-2.265-1.324-2.685-.537-.425.79 2.913 1.718 2.94 1.725l.16.04.175.042c1.227.284 3.565.65 4.435-.604.673-.973.64-1.709-.248-2.61l-.057-.057c-.945-.928-1.495-2.288-1.495-2.288l-.017-.058-.025-.072c-.082-.22-.284-.639-.63-.584-.46.073-.798 1.21.12 1.933l.05.038c.977.721-.195 1.21-.573.534l-.058-.104-.143-.25c-.463-.799-1.282-2.111-1.739-2.397-.532-.332-.907-.148-.782.541zm14.842-.541c-.533.335-1.563 2.074-1.94 2.751a.613.613 0 01-.687.302.436.436 0 01-.176-.098.303.303 0 01-.049-.06l-.014-.028-.008-.02-.007-.019-.003-.013-.003-.017a.289.289 0 01-.004-.048c0-.12.071-.266.25-.427.026-.024.054-.047.084-.07l.047-.036c.022-.016.043-.032.063-.049.883-.71.573-1.81.131-1.917l-.031-.006-.056-.004a.368.368 0 00-.062.006l-.028.005-.042.014-.039.017-.028.015-.028.019-.036.027-.023.02c-.173.158-.273.428-.31.542l-.016.054s-.53 1.309-1.439 2.234l-.054.054c-.365.358-.596.69-.702 1.018-.143.437-.066.868.21 1.353.055.097.117.195.187.296.882 1.275 3.282.876 4.494.59l.286-.07.25-.074c.276-.084.736-.233 1.2-.42l.188-.077.065-.028.064-.028.124-.056.081-.038c.529-.252.964-.543.994-.827l.001-.036a.299.299 0 00-.037-.139c-.094-.176-.271-.212-.491-.168l-.045.01c-.044.01-.09.024-.136.04l-.097.035-.054.022c-.559.23-1.238.705-1.607.745h.006a.452.452 0 01-.05.003h-.024l-.024-.003-.023-.005c-.068-.016-.116-.06-.14-.142a.22.22 0 01-.005-.1c.062-.345.958-.595 1.713-.91l.066-.028c.528-.224.97-.483.985-.832v-.04a.47.47 0 00-.016-.098c-.048-.18-.175-.251-.36-.251-.785 0-2.55 1.36-2.92 1.36-.025 0-.048-.007-.058-.024a.6.6 0 01-.046-.088c-.1-.238.068-.462 1.06-1.066l.209-.126c.538-.32 1.01-.588 1.341-.831.29-.212.475-.406.503-.6l.003-.028c.008-.113-.038-.227-.147-.344a.266.266 0 00-.07-.054l-.034-.015-.013-.005a.403.403 0 00-.13-.02c-.162 0-.369.07-.595.18-.637.313-1.431.952-1.826 1.285l-.249.215-.033.033c-.08.078-.288.27-.493.386l-.071.037-.041.019a.535.535 0 01-.122.036h.005a.346.346 0 01-.031.003l.01-.001-.013.001c-.079.005-.145-.021-.19-.095a.113.113 0 01-.014-.065c.027-.465 2.034-1.991 2.152-2.642l.009-.048c.1-.65-.271-.817-.791-.493zM11.938 2.984c-4.798 0-8.688 3.829-8.688 8.55 0 .692.083 1.364.24 2.008l.008-.009c.252-.298.612-.46 1.017-.46.355.008.699.117.993.312.22.14.465.384.715.694.261-.372.69-.598 1.15-.605.852 0 1.367.728 1.562 1.383l.047.105.06.127c.192.396.595 1.139 1.143 1.68 1.06 1.04 1.324 2.115.8 3.266a8.865 8.865 0 002.024-.014c-.505-1.12-.26-2.17.74-3.186l.066-.066c.695-.684 1.157-1.69 1.252-1.912.195-.655.708-1.383 1.56-1.383.46.007.889.233 1.15.605.25-.31.495-.553.718-.694a1.87 1.87 0 01.99-.312c.357 0 .682.126.925.36.14-.61.215-1.245.215-1.898 0-4.722-3.89-8.55-8.687-8.55zm1.857 8.926l.439-.212c.553-.264.89-.383.89.152 0 1.093-.771 3.208-3.155 3.262h-.184c-2.325-.052-3.116-2.06-3.156-3.175l-.001-.087c0-1.107 1.452.586 3.25.586.716 0 1.379-.272 1.917-.526zm4.017-3.143c.45 0 .813.358.813.8 0 .441-.364.8-.813.8a.806.806 0 01-.812-.8c0-.442.364-.8.812-.8zm-11.624 0c.448 0 .812.358.812.8 0 .441-.364.8-.812.8a.806.806 0 01-.813-.8c0-.442.364-.8.813-.8zm7.79-.841c.32-.384.846-.54 1.33-.394.483.146.83.564.878 1.06.048.495-.212.97-.659 1.203-.322.168-.447-.477-.767-.585l.002-.003c-.287-.098-.772.362-.925.079a1.215 1.215 0 01.14-1.36zm-4.323 0c.322.384.377.92.14 1.36-.152.283-.64-.177-.925-.079l.003.003c-.108.036-.194.134-.273.24l-.118.165c-.11.15-.22.262-.377.18a1.226 1.226 0 01-.658-1.204c.048-.495.395-.913.878-1.059a1.262 1.262 0 011.33.394z"/></svg>';
    var svgVercel = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22L12 2z"/></svg>';
    var svgDefaultSource = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>';

    function getSourceIcon(sourceId) {
      if (!sourceId) return svgDefaultSource;
      var id = sourceId.toLowerCase();
      if (id.indexOf('anthropic') !== -1) return svgAnthropic;
      if (id.indexOf('openai') !== -1) return svgOpenAI;
      if (id.indexOf('github') !== -1) return svgGitHub;
      if (id.indexOf('huggingface') !== -1 || id.indexOf('hugging') !== -1) return svgHuggingFace;
      if (id.indexOf('vercel') !== -1) return svgVercel;
      return svgDefaultSource;
    }

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
    const fileExplorer   = document.getElementById('fileExplorer');
    const fileTree       = document.getElementById('fileTree');
    const errorState     = document.getElementById('errorState');
    const errorDetail    = document.getElementById('errorDetail');
    const retryBtn       = document.getElementById('retryBtn');
    const toastContainer = document.getElementById('toastContainer');

    // Registry tab elements
    const registrySearchBox  = document.getElementById('registrySearchBox');
    const registryInitial    = document.getElementById('registryInitial');
    const registrySearching  = document.getElementById('registrySearching');
    const registryNoResults  = document.getElementById('registryNoResults');
    const registryResultsList = document.getElementById('registryResultsList');
    var registryInstalledSet = new Set();

    var currentPreviewSkill = null;

    // ---- Tab switching ----
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var tabId = btn.getAttribute('data-tab');
        if (tabId === 'sources') {
          document.getElementById('sourcesPanel').classList.add('active');
        } else if (tabId === 'registry') {
          document.getElementById('registryPanel').classList.add('active');
          registrySearchBox.focus();
        }
      });
    });

    // Toast helper
    function showToast(message, type) {
      var toast = document.createElement('div');
      toast.className = 'toast toast-' + (type || 'error');
      var icon = type === 'info' ? '\u2139\uFE0F' : '\u274C';
      toast.innerHTML = '<span class="toast-icon">' + icon + '</span>' +
        '<span class="toast-msg">' + escapeHtml(message) + '</span>' +
        '<button class="toast-close">\u2715</button>';
      toastContainer.appendChild(toast);
      toast.querySelector('.toast-close').addEventListener('click', function() {
        toast.classList.add('fade-out');
        setTimeout(function() { toast.remove(); }, 300);
      });
      setTimeout(function() {
        if (toast.parentNode) {
          toast.classList.add('fade-out');
          setTimeout(function() { toast.remove(); }, 300);
        }
      }, 8000);
    }

    retryBtn.addEventListener('click', function() {
      vscode.postMessage({ command: 'refresh' });
    });

    // ---- Registry search ----
    var registrySearchTimer;
    registrySearchBox.addEventListener('input', function() {
      clearTimeout(registrySearchTimer);
      var query = registrySearchBox.value.trim();
      if (query.length < 2) {
        registryInitial.style.display = 'block';
        registrySearching.style.display = 'none';
        registryNoResults.style.display = 'none';
        registryResultsList.style.display = 'none';
        return;
      }
      registrySearchTimer = setTimeout(function() {
        vscode.postMessage({ command: 'searchRegistry', query: query });
      }, 300);
    });

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
          errorState.style.display = 'none';
          break;
        case 'loadError':
          loadingState.style.display = 'none';
          emptyState.style.display = 'none';
          errorState.style.display = 'block';
          errorDetail.textContent = msg.error || 'Unknown error';
          break;
        case 'toast':
          showToast(msg.message, msg.type || 'error');
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
        case 'showFilePreview':
          showFileContent(msg.fileName, msg.content, msg.isMarkdown);
          break;
        case 'filterSource':
          applySourceFilter(msg.sourceId);
          break;
        case 'registrySearching':
          registryInitial.style.display = 'none';
          registrySearching.style.display = 'block';
          registryNoResults.style.display = 'none';
          registryResultsList.style.display = 'none';
          break;
        case 'registryResults':
          registryInitial.style.display = 'none';
          registrySearching.style.display = 'none';
          if (msg.skills.length === 0) {
            registryNoResults.style.display = 'block';
            registryResultsList.style.display = 'none';
          } else {
            registryNoResults.style.display = 'none';
            registryResultsList.style.display = 'block';
            renderRegistryResults(msg.skills);
          }
          break;
        case 'registryInstalling':
          var installingBtns = registryResultsList.querySelectorAll('[data-skill-id="' + msg.skillId + '"]');
          installingBtns.forEach(function(b) {
            b.classList.add('loading');
            b.textContent = '\u23F3';
            b.disabled = true;
          });
          break;
        case 'registryInstalled':
          registryInstalledSet.add(msg.skillId);
          var doneBtns = registryResultsList.querySelectorAll('[data-skill-id="' + msg.skillId + '"]');
          doneBtns.forEach(function(b) {
            b.classList.remove('loading');
            b.classList.add('installed');
            b.textContent = '\u2713 ' + loc.installedLabel;
            b.disabled = true;
          });
          break;
        case 'registryInstallFailed':
          var failBtns = registryResultsList.querySelectorAll('[data-skill-id="' + msg.skillId + '"]');
          failBtns.forEach(function(b) {
            b.classList.remove('loading');
            b.textContent = loc.registryInstallToLibrary;
            b.disabled = false;
          });
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

        var filesBadge = skill.additionalFilesCount > 0
          ? '<span class="files-badge">' + svgClip + ' ' + skill.additionalFilesCount + ' file(s)</span>'
          : '';

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
          '<div class="skill-icon">' + getSourceIcon(skill.sourceId) + '</div>' +
          '<div class="skill-info">' +
            '<div class="skill-name">' + escapeHtml(skill.name) + '</div>' +
            '<div class="skill-desc">' + escapeHtml(skill.description) + '</div>' +
            '<div class="skill-meta">' +
              '<span class="source-tag"><span class="repo-icon">' + svgPackage + '</span> ' + escapeHtml(skill.sourceLabel) + '</span>' +
              (meta ? '<span style="font-size:0.8em;opacity:0.7">' + meta + '</span>' : '') +
              filesBadge +
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

    function renderRegistryResults(skills) {
      registryResultsList.innerHTML = skills.map(function(skill) {
        var isInstalled = registryInstalledSet.has(skill.skillId);
        var btnClass = isInstalled ? 'registry-install-btn installed' : 'registry-install-btn';
        var btnText = isInstalled ? '\u2713 ' + escapeHtml(loc.installedLabel) : escapeHtml(loc.registryInstallToLibrary);
        return '<li class="registry-skill-item">' +
          '<div class="registry-skill-icon">' + getSourceIcon(skill.source) + '</div>' +
          '<div class="registry-skill-info">' +
            '<div class="registry-skill-name">' + escapeHtml(skill.name) + '</div>' +
            '<div class="registry-skill-source">' +
              '<span>' + svgPackage + '</span> ' + escapeHtml(skill.source) +
              (skill.installsLabel ? ' <span class="registry-installs-badge">' + svgChart + ' ' + escapeHtml(skill.installsLabel) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="registry-skill-actions">' +
            '<button class="' + btnClass + '"' +
              ' data-skill-id="' + escapeHtml(skill.skillId) + '"' +
              ' data-entry=\\''+escapeHtml(JSON.stringify(skill))+'\\'' +
              (isInstalled ? ' disabled' : '') +
            '>' + btnText + '</button>' +
          '</div>' +
        '</li>';
      }).join('');

      registryResultsList.querySelectorAll('.registry-install-btn:not(.installed)').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          try {
            var entry = JSON.parse(btn.getAttribute('data-entry'));
            vscode.postMessage({
              command: 'installFromRegistry',
              entry: { id: entry.id, skillId: entry.skillId, name: entry.name, installs: entry.installs, source: entry.source },
            });
          } catch(err) {
            console.error('Failed to parse entry', err);
          }
        });
      });
    }

    function showDetail(skill) {
      currentPreviewSkill = skill;

      // Hide list, show detail
      document.querySelector('.tab-bar').style.display = 'none';
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.style.display = 'none'; });
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
        metaParts.push('<span class="detail-meta-item"><span class="repo-icon">' + svgPackage + '</span> <strong>' + escapeHtml(skill.sourceLabel) + '</strong></span>');
      }
      if (skill.author) {
        metaParts.push('<span class="detail-meta-item">' + svgUser + ' ' + escapeHtml(skill.author) + '</span>');
      }
      if (skill.version) {
        metaParts.push('<span class="detail-meta-item">v' + escapeHtml(skill.version) + '</span>');
      }
      if (skill.license) {
        metaParts.push('<span class="detail-meta-item">' + svgLicense + ' ' + escapeHtml(skill.license) + '</span>');
      }
      if (skill.tags && skill.tags.length > 0) {
        metaParts.push('<span class="detail-tags">' +
          skill.tags.map(function(t) { return '<span class="tag">' + escapeHtml(t) + '</span>'; }).join('') +
        '</span>');
      }
      detailMeta.innerHTML = metaParts.join('');

      // Store the skill body HTML for switching back to SKILL.md
      var skillBodyHtml = skill.bodyHtml || '';

      // Build file explorer sidebar
      var hasFiles = skill.additionalFiles && skill.additionalFiles.length > 0;
      if (hasFiles) {
        fileExplorer.classList.remove('hidden');
        var treeHtml = '<li class="file-tree-item active" data-tab="skill-md">' +
          '<span class="file-tree-icon">' + svgFileDoc + '</span><span class="file-tree-name">SKILL.md</span></li>';
        treeHtml += skill.additionalFiles.map(function(f) {
          var icon = svgFileDoc;
          if (f.match(/\\.(sh|bash|py|js|ts)$/)) icon = svgGear;
          if (f.match(/^scripts\\//)) icon = svgGear;
          if (f.match(/\\.md$/i)) icon = svgEdit;
          return '<li class="file-tree-item" data-tab="file" data-file-path="' + escapeHtml(f) + '">' +
            '<span class="file-tree-icon">' + icon + '</span><span class="file-tree-name">' + escapeHtml(f) + '</span></li>';
        }).join('');
        fileTree.innerHTML = treeHtml;
      } else {
        fileExplorer.classList.add('hidden');
        fileTree.innerHTML = '';
      }

      // Show SKILL.md content by default
      detailBody.innerHTML = skillBodyHtml;

      // Cache for loaded file contents
      var fileContentCache = {};

      // Bind file tree click events
      fileTree.querySelectorAll('.file-tree-item').forEach(function(item) {
        item.addEventListener('click', function() {
          // Update active highlight
          fileTree.querySelectorAll('.file-tree-item').forEach(function(i) { i.classList.remove('active'); });
          item.classList.add('active');

          var tabType = item.getAttribute('data-tab');
          if (tabType === 'skill-md') {
            detailBody.innerHTML = skillBodyHtml;
            return;
          }

          var filePath = item.getAttribute('data-file-path');
          if (!filePath || !currentPreviewSkill) return;

          // Check cache first
          if (fileContentCache[filePath]) {
            renderFileContent(filePath, fileContentCache[filePath]);
            return;
          }

          // Show loading state
          detailBody.innerHTML = '<div class="file-loading"><div class="spinner"></div><p>' + escapeHtml(loc.loadingFile) + '</p></div>';

          // Request file content from extension
          vscode.postMessage({
            command: 'previewFile',
            sourceId: currentPreviewSkill.sourceId,
            repoPath: currentPreviewSkill.repoPath,
            filePath: filePath,
          });
        });
      });

      // Helper to render file content into detail body
      function renderFileContent(fileName, content) {
        var isMarkdown = /\\.md$/i.test(fileName);
        if (isMarkdown) {
          detailBody.innerHTML = content;
        } else {
          detailBody.innerHTML = renderCodeView(content, fileName);
        }
      }

      // Override showFileContent for this detail session
      currentFileContentHandler = function(fileName, content, isMarkdown) {
        // Cache the raw content
        fileContentCache[fileName] = content;
        // If the tree item for this file is still active, render it
        var activeItem = fileTree.querySelector('.file-tree-item.active');
        if (activeItem && activeItem.getAttribute('data-file-path') === fileName) {
          if (isMarkdown) {
            detailBody.innerHTML = content;
          } else {
            detailBody.innerHTML = renderCodeView(content, fileName);
          }
        }
      };
    }

    // Current handler for file content responses (set by showDetail)
    var currentFileContentHandler = null;

    function showFileContent(fileName, content, isMarkdown) {
      if (currentFileContentHandler) {
        currentFileContentHandler(fileName, content, isMarkdown);
      }
    }

    function hideDetail() {
      currentPreviewSkill = null;
      currentFileContentHandler = null;
      detailView.classList.remove('active');
      listView.classList.remove('hidden');
      fileExplorer.classList.add('hidden');
      fileTree.innerHTML = '';
      // Restore tab bar and active tab panel
      document.querySelector('.tab-bar').style.display = '';
      document.querySelectorAll('.tab-panel').forEach(function(p) {
        p.style.display = '';
      });
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

    function getLang(fileName) {
      var ext = (fileName.match(/\\.([^.]+)$/) || [])[1];
      if (!ext) return '';
      ext = ext.toLowerCase();
      var map = {
        js:'js', mjs:'js', cjs:'js', jsx:'js',
        ts:'ts', tsx:'ts', mts:'ts',
        py:'py', pyw:'py',
        html:'html', htm:'html', xml:'html', svg:'html',
        css:'css', scss:'css', less:'css',
        json:'json',
        yaml:'yaml', yml:'yaml',
        sh:'sh', bash:'sh', zsh:'sh', fish:'sh',
        sql:'sql',
        rs:'rs', go:'go', java:'java', kt:'java', c:'c', cpp:'c', h:'c', hpp:'c', cs:'c',
        rb:'rb', php:'php', lua:'lua', r:'r',
        toml:'toml', ini:'toml', cfg:'toml',
        dockerfile:'sh',
      };
      return map[ext] || '';
    }

    function highlightCode(code, lang) {
      var h = escapeHtml(code);
      if (!lang) return h;

      // Comment patterns
      var lineComment = '//';
      var blockStart = null, blockEnd = null;
      if (lang === 'py' || lang === 'rb' || lang === 'r') lineComment = '#';
      if (lang === 'sh') lineComment = '#';
      if (lang === 'sql') lineComment = '--';
      if (lang === 'lua') lineComment = '--';
      if (lang === 'toml') lineComment = '#';
      if (lang === 'html') { lineComment = null; blockStart = '&lt;!--'; blockEnd = '--&gt;'; }
      if (lang === 'css') { lineComment = null; blockStart = '/*'; blockEnd = '*/'; }

      // Process line by line for comments
      var lines = h.split('\\n');
      var inBlock = false;
      lines = lines.map(function(line) {
        if (inBlock) {
          var endIdx = blockEnd ? line.indexOf(blockEnd) : -1;
          if (endIdx >= 0) {
            inBlock = false;
            return '<span class="hl-cm">' + line.substring(0, endIdx + blockEnd.length) + '</span>' + line.substring(endIdx + blockEnd.length);
          }
          return '<span class="hl-cm">' + line + '</span>';
        }
        if (blockStart) {
          var bsIdx = line.indexOf(blockStart);
          if (bsIdx >= 0) {
            var beIdx = blockEnd ? line.indexOf(blockEnd, bsIdx + blockStart.length) : -1;
            if (beIdx >= 0) {
              return line.substring(0, bsIdx) + '<span class="hl-cm">' + line.substring(bsIdx, beIdx + blockEnd.length) + '</span>' + line.substring(beIdx + blockEnd.length);
            } else {
              inBlock = true;
              return line.substring(0, bsIdx) + '<span class="hl-cm">' + line.substring(bsIdx) + '</span>';
            }
          }
        }
        if (lineComment) {
          // Check for line comment (not inside a string — simple heuristic)
          var cmIdx = line.indexOf(lineComment === '#' ? '#' : (lineComment === '--' ? '--' : '//'));
          if (cmIdx >= 0) {
            var before = line.substring(0, cmIdx);
            return before + '<span class="hl-cm">' + line.substring(cmIdx) + '</span>';
          }
        }
        return line;
      });
      h = lines.join('\\n');

      // Strings (double & single quotes, backticks for JS/TS)
      var bt = String.fromCharCode(96);
      h = h.replace(new RegExp('("[^"]*"|' + "'" + "[^']*'" + '|' + bt + '[^' + bt + ']*' + bt + ')', 'g'), '<span class="hl-str">$1</span>');

      // Numbers
      h = h.replace(/\\b(\\d+\\.?\\d*(?:e[+-]?\\d+)?)\\b/gi, '<span class="hl-num">$1</span>');

      // Language-specific keywords
      var kw = [];
      if (lang === 'js' || lang === 'ts') {
        kw = ['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','new','this','class','extends','import','export','from','default','async','await','try','catch','finally','throw','typeof','instanceof','in','of','yield','delete','void','null','undefined','true','false'];
        if (lang === 'ts') kw = kw.concat(['interface','type','enum','namespace','declare','abstract','implements','readonly','as','is','keyof','infer','never','unknown','any']);
      } else if (lang === 'py') {
        kw = ['def','class','if','elif','else','for','while','return','import','from','as','try','except','finally','raise','with','yield','lambda','pass','break','continue','and','or','not','is','in','None','True','False','self','async','await','global','nonlocal'];
      } else if (lang === 'html') {
        // HTML tags
        h = h.replace(/(&lt;\\/?)([a-zA-Z][a-zA-Z0-9-]*)/g, '$1<span class="hl-tag">$2</span>');
        h = h.replace(/\\s([a-zA-Z-]+)(=)/g, ' <span class="hl-attr">$1</span>$2');
      } else if (lang === 'css') {
        kw = ['important','inherit','initial','unset','none'];
        h = h.replace(/([.#][a-zA-Z_][a-zA-Z0-9_-]*)/g, '<span class="hl-fn">$1</span>');
        h = h.replace(/(@[a-zA-Z-]+)/g, '<span class="hl-kw">$1</span>');
      } else if (lang === 'json') {
        h = h.replace(/(&quot;[^&]*?&quot;)\\s*:/g, '<span class="hl-attr">$1</span>:');
      } else if (lang === 'yaml') {
        h = h.replace(/^(\\s*)([a-zA-Z_][a-zA-Z0-9_-]*)\\s*:/gm, '$1<span class="hl-attr">$2</span>:');
      } else if (lang === 'sh') {
        kw = ['if','then','else','elif','fi','for','while','do','done','case','esac','in','function','return','local','export','source','echo','exit','set','unset','readonly','shift','eval','exec','trap','wait','cd','pwd','test'];
      } else if (lang === 'sql') {
        kw = ['SELECT','FROM','WHERE','INSERT','INTO','UPDATE','SET','DELETE','CREATE','DROP','ALTER','TABLE','INDEX','VIEW','JOIN','INNER','LEFT','RIGHT','OUTER','ON','AND','OR','NOT','NULL','IS','IN','BETWEEN','LIKE','ORDER','BY','GROUP','HAVING','LIMIT','OFFSET','AS','DISTINCT','UNION','ALL','EXISTS','CASE','WHEN','THEN','ELSE','END'];
      } else if (lang === 'go') {
        kw = ['package','import','func','return','var','const','type','struct','interface','map','chan','range','if','else','for','switch','case','default','break','continue','go','defer','select','fallthrough','nil','true','false'];
      } else if (lang === 'rs') {
        kw = ['fn','let','mut','const','if','else','for','while','loop','match','return','use','mod','pub','struct','enum','impl','trait','where','self','Self','super','crate','as','in','ref','move','async','await','dyn','true','false','None','Some'];
      } else if (lang === 'java' || lang === 'c' || lang === 'php') {
        kw = ['if','else','for','while','do','switch','case','break','continue','return','class','interface','extends','implements','new','this','super','public','private','protected','static','final','abstract','void','int','long','double','float','char','boolean','string','null','true','false','import','package','try','catch','finally','throw','throws'];
      } else if (lang === 'rb') {
        kw = ['def','class','module','if','elsif','else','unless','while','until','for','do','end','return','require','include','attr_accessor','attr_reader','attr_writer','self','nil','true','false','yield','block_given','begin','rescue','ensure','raise'];
      } else if (lang === 'lua') {
        kw = ['local','function','if','then','else','elseif','end','for','while','do','repeat','until','return','nil','true','false','and','or','not','in','require'];
      } else if (lang === 'toml') {
        kw = ['true','false'];
      }

      if (kw.length > 0) {
        var kwPattern = new RegExp('\\\\b(' + kw.join('|') + ')\\\\b', 'g');
        h = h.replace(kwPattern, '<span class="hl-kw">$1</span>');
      }

      // Function calls: word followed by (
      h = h.replace(/\\b([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\(/g, '<span class="hl-fn">$1</span>(');

      return h;
    }

    function renderCodeView(code, fileName) {
      var lang = getLang(fileName);
      var langLabel = lang ? '<span class="code-lang-badge">' + escapeHtml(lang) + '</span>' : '';
      return '<div class="code-view">' + langLabel + '<pre>' + highlightCode(code, lang) + '</pre></div>';
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
