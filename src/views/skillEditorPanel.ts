import * as vscode from 'vscode';
import { Skill, SkillMetadata } from '../models/skill';
import { StorageService } from '../services/storageService';

/**
 * Get localized strings for the editor webview
 */
function getEditorStrings() {
  return {
    createNewSkill: vscode.l10n.t('Create New Skill'),
    editSkill: '✎ ' + vscode.l10n.t('Edit: {0}', '').replace(/[：: ]*$/, ''),
    skillId: vscode.l10n.t('Skill ID'),
    skillIdHint: vscode.l10n.t('Directory name, use kebab-case (e.g., my-cool-skill)'),
    name: vscode.l10n.t('Name'),
    description: vscode.l10n.t('Description'),
    descriptionHint: vscode.l10n.t('When should this skill be used? What does it do?'),
    author: vscode.l10n.t('Author'),
    version: vscode.l10n.t('Version'),
    license: vscode.l10n.t('License'),
    compatibility: vscode.l10n.t('Compatibility'),
    tags: vscode.l10n.t('Tags'),
    tagsHint: vscode.l10n.t('Comma-separated'),
    skillContent: vscode.l10n.t('Skill Content (Markdown)'),
    skillContentHint: vscode.l10n.t('The main instruction content of SKILL.md'),
    cancel: vscode.l10n.t('Cancel'),
    createSkill: vscode.l10n.t('Create Skill'),
    saveChanges: vscode.l10n.t('Save Changes'),
    idRequired: vscode.l10n.t('Skill ID is required'),
    idFormat: vscode.l10n.t('Use lowercase letters, numbers, and hyphens only'),
    nameRequired: vscode.l10n.t('Skill name is required'),
    descPlaceholder: vscode.l10n.t('Describe when to use this skill...'),
  };
}

/**
 * Webview panel for viewing and editing a skill
 */
export class SkillEditorPanel {
  public static currentPanels: Map<string, SkillEditorPanel> = new Map();
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private skill: Skill | null,
    private storageService: StorageService,
    private readonly _extensionUri: vscode.Uri,
    private isNew: boolean,
    private onSaved?: () => void,
  ) {
    this._panel = panel;
    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'save':
            await this._handleSave(message.data);
            break;
          case 'cancel':
            this._panel.dispose();
            break;
        }
      },
      null,
      this._disposables
    );
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    storageService: StorageService,
    skill: Skill | null,
    isNew: boolean,
    onSaved?: () => void,
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    const panelKey = skill?.id || '__new__';

    // Check if panel already exists
    if (SkillEditorPanel.currentPanels.has(panelKey)) {
      SkillEditorPanel.currentPanels.get(panelKey)?._panel.reveal(column);
      return;
    }

    const title = isNew
      ? vscode.l10n.t('Create New Skill')
      : vscode.l10n.t('Edit: {0}', skill?.metadata.name ?? '');

    const panel = vscode.window.createWebviewPanel(
      'skilldockEditor',
      title,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    const editorPanel = new SkillEditorPanel(panel, skill, storageService, extensionUri, isNew, onSaved);
    SkillEditorPanel.currentPanels.set(panelKey, editorPanel);
  }

  private async _handleSave(data: { id: string; metadata: SkillMetadata; body: string }): Promise<void> {
    try {
      if (this.isNew) {
        await this.storageService.createSkill(data.id, data.metadata, data.body);
        vscode.window.showInformationMessage(
          vscode.l10n.t('Skill "{0}" created successfully!', data.metadata.name)
        );
      } else {
        await this.storageService.updateSkill(this.skill?.id ?? data.id, data.metadata, data.body);
        vscode.window.showInformationMessage(
          vscode.l10n.t('Skill "{0}" updated successfully!', data.metadata.name)
        );
      }

      this.onSaved?.();
      this._panel.dispose();
    } catch (err) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to save skill: {0}', String(err))
      );
    }
  }

  private _update(): void {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview(): string {
    const nonce = getNonce();
    const skill = this.skill;
    const t = getEditorStrings();

    const existingData = skill ? JSON.stringify({
      id: skill.id,
      name: skill.metadata.name,
      description: skill.metadata.description,
      license: skill.metadata.license || '',
      compatibility: skill.metadata.compatibility || '',
      author: skill.metadata.author || '',
      version: skill.metadata.version || '',
      tags: (skill.metadata.tags || []).join(', '),
      body: skill.body,
    }) : 'null';

    const titleText = this.isNew ? ('✦ ' + t.createNewSkill) : ('✎ ' + (skill?.metadata.name ?? ''));

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>${this.isNew ? t.createSkill : t.saveChanges}</title>
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
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background: var(--bg);
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }

    h1 {
      font-size: 1.4em;
      margin-bottom: 20px;
      font-weight: 600;
    }

    .form-group {
      margin-bottom: 16px;
    }

    label {
      display: block;
      margin-bottom: 4px;
      font-weight: 500;
      font-size: 0.9em;
    }

    .hint {
      font-size: 0.8em;
      opacity: 0.7;
      margin-bottom: 4px;
    }

    input, textarea {
      width: 100%;
      padding: 6px 8px;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      font-family: inherit;
      font-size: inherit;
    }

    input:focus, textarea:focus {
      outline: none;
      border-color: var(--focus);
    }

    textarea {
      min-height: 300px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.5;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .row-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 20px;
      justify-content: flex-end;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      font-weight: 500;
    }

    .btn-primary {
      background: var(--btn-bg);
      color: var(--btn-fg);
    }

    .btn-primary:hover {
      background: var(--btn-hover);
    }

    .btn-secondary {
      background: var(--btn-secondary-bg);
      color: var(--btn-secondary-fg);
    }

    .error {
      color: var(--vscode-errorForeground);
      font-size: 0.85em;
      margin-top: 2px;
    }

    .separator {
      border-top: 1px solid var(--border);
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>${titleText}</h1>

  <div class="form-group">
    <label for="skillId">${t.skillId}</label>
    <div class="hint">${t.skillIdHint}</div>
    <input type="text" id="skillId" placeholder="my-skill-name" ${this.isNew ? '' : 'disabled'} />
    <div id="idError" class="error" style="display:none"></div>
  </div>

  <div class="separator"></div>

  <div class="form-group">
    <label for="skillName">${t.name}</label>
    <input type="text" id="skillName" placeholder="My Skill Name" />
  </div>

  <div class="form-group">
    <label for="skillDesc">${t.description}</label>
    <div class="hint">${t.descriptionHint}</div>
    <input type="text" id="skillDesc" placeholder="${t.descPlaceholder}" />
  </div>

  <div class="row-3">
    <div class="form-group">
      <label for="skillAuthor">${t.author}</label>
      <input type="text" id="skillAuthor" placeholder="your-name" />
    </div>
    <div class="form-group">
      <label for="skillVersion">${t.version}</label>
      <input type="text" id="skillVersion" placeholder="1.0" />
    </div>
    <div class="form-group">
      <label for="skillLicense">${t.license}</label>
      <input type="text" id="skillLicense" placeholder="MIT" />
    </div>
  </div>

  <div class="row">
    <div class="form-group">
      <label for="skillCompat">${t.compatibility}</label>
      <input type="text" id="skillCompat" placeholder="" />
    </div>
    <div class="form-group">
      <label for="skillTags">${t.tags}</label>
      <div class="hint">${t.tagsHint}</div>
      <input type="text" id="skillTags" placeholder="workflow, ai, utils" />
    </div>
  </div>

  <div class="separator"></div>

  <div class="form-group">
    <label for="skillBody">${t.skillContent}</label>
    <div class="hint">${t.skillContentHint}</div>
    <textarea id="skillBody" placeholder="# My Skill\n\nDescribe the skill workflow here..."></textarea>
  </div>

  <div class="actions">
    <button class="btn-secondary" onclick="cancel()">${t.cancel}</button>
    <button class="btn-primary" onclick="save()">
      ${this.isNew ? t.createSkill : t.saveChanges}
    </button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const existing = ${existingData};
    const isNew = ${this.isNew};
    const loc = ${JSON.stringify({
      idRequired: t.idRequired,
      idFormat: t.idFormat,
      nameRequired: t.nameRequired,
    })};

    // Populate form if editing
    if (existing) {
      document.getElementById('skillId').value = existing.id;
      document.getElementById('skillName').value = existing.name;
      document.getElementById('skillDesc').value = existing.description;
      document.getElementById('skillAuthor').value = existing.author;
      document.getElementById('skillVersion').value = existing.version;
      document.getElementById('skillLicense').value = existing.license;
      document.getElementById('skillCompat').value = existing.compatibility;
      document.getElementById('skillTags').value = existing.tags;
      document.getElementById('skillBody').value = existing.body;
    }

    function validate() {
      const id = document.getElementById('skillId').value.trim();
      const name = document.getElementById('skillName').value.trim();
      const errorEl = document.getElementById('idError');

      if (!id) {
        errorEl.textContent = loc.idRequired;
        errorEl.style.display = 'block';
        return false;
      }

      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id) && id.length > 1) {
        errorEl.textContent = loc.idFormat;
        errorEl.style.display = 'block';
        return false;
      }

      if (!name) {
        errorEl.textContent = loc.nameRequired;
        errorEl.style.display = 'block';
        return false;
      }

      errorEl.style.display = 'none';
      return true;
    }

    function save() {
      if (!validate()) return;

      const tags = document.getElementById('skillTags').value
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      vscode.postMessage({
        command: 'save',
        data: {
          id: document.getElementById('skillId').value.trim(),
          metadata: {
            name: document.getElementById('skillName').value.trim(),
            description: document.getElementById('skillDesc').value.trim(),
            license: document.getElementById('skillLicense').value.trim() || undefined,
            compatibility: document.getElementById('skillCompat').value.trim() || undefined,
            author: document.getElementById('skillAuthor').value.trim() || undefined,
            version: document.getElementById('skillVersion').value.trim() || undefined,
            tags: tags.length > 0 ? tags : undefined,
          },
          body: document.getElementById('skillBody').value,
        }
      });
    }

    function cancel() {
      vscode.postMessage({ command: 'cancel' });
    }
  </script>
</body>
</html>`;
  }

  dispose(): void {
    const key = this.skill?.id || '__new__';
    SkillEditorPanel.currentPanels.delete(key);

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
