import * as vscode from 'vscode';
import { Skill } from '../models/skill';
import { StorageService } from '../services/storageService';
import { ImportExportService } from '../services/importExportService';

const SKILL_MIME = 'application/vnd.code.tree.skilldock.reposkills';

/**
 * TreeView item representing a skill
 */
export class SkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly source: 'library' | 'repo',
  ) {
    super(skill.metadata.name, vscode.TreeItemCollapsibleState.None);

    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${skill.metadata.name}**\n\n`);
    this.tooltip.appendMarkdown(`${skill.metadata.description}\n\n`);
    if (skill.metadata.author) {
      this.tooltip.appendMarkdown(`*${vscode.l10n.t('Author:')}* ${skill.metadata.author}\n\n`);
    }
    if (skill.metadata.version) {
      this.tooltip.appendMarkdown(`*${vscode.l10n.t('Version:')}* ${skill.metadata.version}\n\n`);
    }
    if (skill.metadata.tags && skill.metadata.tags.length > 0) {
      this.tooltip.appendMarkdown(`*${vscode.l10n.t('Tags:')}* ${skill.metadata.tags.join(', ')}\n\n`);
    }

    this.description = skill.metadata.description.length > 60
      ? skill.metadata.description.slice(0, 57) + '...'
      : skill.metadata.description;

    this.contextValue = 'skill';
    this.iconPath = new vscode.ThemeIcon('symbol-method');

    this.command = {
      command: 'skilldock.viewSkill',
      title: vscode.l10n.t('View Skill'),
      arguments: [skill, source],
    };
  }
}

/**
 * TreeDataProvider for the Skill Library sidebar
 */
export class SkillLibraryProvider implements vscode.TreeDataProvider<SkillTreeItem>, vscode.TreeDragAndDropController<SkillTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SkillTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _skills: Skill[] = [];
  private _filterText = '';

  // Drag and drop
  readonly dropMimeTypes: string[] = [SKILL_MIME];
  readonly dragMimeTypes: string[] = [];

  private _importExportService: ImportExportService | undefined;

  constructor(private storageService: StorageService) {
    // Listen for storage changes
    storageService.onDidChange(() => this.refresh());
  }

  /** Must be called after construction to wire up the import service */
  setImportExportService(service: ImportExportService): void {
    this._importExportService = service;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setFilter(text: string): void {
    this._filterText = text;
    this.refresh();
  }

  // --- Drag: not supported from library ---
  handleDrag(): void { /* no-op */ }

  // --- Drop: accept skills from repo tree ---
  async handleDrop(_target: SkillTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const raw = dataTransfer.get(SKILL_MIME);
    if (!raw || !this._importExportService) { return; }

    let items: Array<{ id: string; dirPath: string; filePath: string; name: string }>;
    try {
      // Use asString() for reliable cross-tree data transfer
      const json = await raw.asString();
      items = JSON.parse(json);
    } catch {
      return;
    }

    let savedCount = 0;
    for (const item of items) {
      try {
        // Check for duplicate in library
        const existing = await this.storageService.readSkill(item.id);
        if (existing) {
          const overwrite = vscode.l10n.t('Overwrite');
          const keepBoth = vscode.l10n.t('Keep Both');
          const skip = vscode.l10n.t('Skip');
          const choice = await vscode.window.showWarningMessage(
            vscode.l10n.t('Skill "{0}" already exists in your library.', item.name),
            overwrite,
            keepBoth,
            skip,
          );

          if (!choice || choice === skip) {
            continue;
          }

          if (choice === overwrite) {
            await this.storageService.deleteSkill(item.id);
          }
          // 'Keep Both' falls through – importFromPath will auto-rename
        }

        // Create a minimal Skill object to pass to exportToLibrary
        const skill: Skill = {
          id: item.id,
          metadata: { name: item.name, description: '' },
          body: '',
          dirPath: item.dirPath,
          filePath: item.filePath,
          lastModified: Date.now(),
        };
        await this._importExportService.exportToLibrary(skill);
        savedCount++;
      } catch {
        // skip errors silently
      }
    }

    if (savedCount > 0) {
      this.refresh();
      vscode.window.showInformationMessage(
        vscode.l10n.t('Saved {0} skill(s) to your library.', savedCount)
      );
    }
  }

  getTreeItem(element: SkillTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<SkillTreeItem[]> {
    try {
      if (this._filterText) {
        this._skills = await this.storageService.searchSkills(this._filterText);
      } else {
        this._skills = await this.storageService.listSkills();
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to load skills: {0}', String(err))
      );
      this._skills = [];
    }

    // Apply sort order from settings
    const sortBy = vscode.workspace.getConfiguration('skilldock').get<string>('librarySortBy', 'name');
    this._skills.sort((a, b) => {
      switch (sortBy) {
        case 'lastModified':
          return b.lastModified - a.lastModified;
        case 'author':
          return (a.metadata.author ?? '').localeCompare(b.metadata.author ?? '')
            || a.metadata.name.localeCompare(b.metadata.name);
        default: // 'name'
          return a.metadata.name.localeCompare(b.metadata.name);
      }
    });

    return this._skills.map(skill => new SkillTreeItem(skill, 'library'));
  }
}
