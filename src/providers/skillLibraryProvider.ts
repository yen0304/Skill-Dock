import * as vscode from 'vscode';
import { Skill } from '../models/skill';
import { StorageService } from '../services/storageService';
import { ImportExportService } from '../services/importExportService';

import * as path from 'path';

const SKILL_MIME = 'application/vnd.code.tree.skilldock.reposkills';

/**
 * Tree item representing a single file inside a skill directory.
 */
export class SkillFileItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly fileName: string,
    public readonly filePath: string,
    public readonly relativePath: string,
  ) {
    super(fileName, vscode.TreeItemCollapsibleState.None);

    const isSkillMd = relativePath === 'SKILL.md';
    this.iconPath = new vscode.ThemeIcon(isSkillMd ? 'file-text' : SkillFileItem._fileIcon(fileName));
    this.contextValue = 'skillFile';
    this.description = isSkillMd ? 'main' : '';
    this.resourceUri = vscode.Uri.file(filePath);

    // Click opens in editor
    this.command = {
      command: 'vscode.open',
      title: vscode.l10n.t('Open File'),
      arguments: [vscode.Uri.file(filePath)],
    };
  }

  private static _fileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['js', 'ts', 'mjs', 'cjs'].includes(ext)) { return 'symbol-method'; }
    if (['json', 'yaml', 'yml', 'toml'].includes(ext)) { return 'settings-gear'; }
    if (['md', 'mdx', 'txt', 'rst'].includes(ext)) { return 'file-text'; }
    if (['sh', 'bash', 'zsh', 'ps1'].includes(ext)) { return 'terminal'; }
    if (['py', 'rb', 'go', 'rs'].includes(ext)) { return 'code'; }
    return 'file';
  }
}

/**
 * Tree item representing a folder inside a skill directory.
 */
export class SkillFolderItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly folderName: string,
    /** Relative path from skill dir *with* trailing slash, e.g. "scripts/" */
    public readonly relativeDir: string,
  ) {
    super(folderName, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('folder');
    this.contextValue = 'skillFolder';
    this.resourceUri = vscode.Uri.file(path.join(skill.dirPath, relativeDir));
  }
}

/**
 * TreeView item representing a skill
 */
export class SkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly source: 'library' | 'repo',
  ) {
    super(skill.metadata.name, vscode.TreeItemCollapsibleState.Collapsed);

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
    if (skill.additionalFiles && skill.additionalFiles.length > 0) {
      this.tooltip.appendMarkdown(`*${vscode.l10n.t('Files:')}* ${skill.additionalFiles.join(', ')}\n\n`);
    }
    if (skill.installCount !== undefined && skill.installCount > 0) {
      this.tooltip.appendMarkdown(`*${vscode.l10n.t('Installed {0} time(s)', skill.installCount)}*\n\n`);
    }

    this.description = skill.metadata.description.length > 60
      ? skill.metadata.description.slice(0, 57) + '...'
      : skill.metadata.description;

    this.contextValue = 'skill';
    this.iconPath = new vscode.ThemeIcon('symbol-method');

    this.command = {
      command: 'skilldock.previewSkill',
      title: vscode.l10n.t('Preview Skill'),
      arguments: [skill, source],
    };
  }
}

/** Union type for all tree items in the library */
export type LibraryTreeItem = SkillTreeItem | SkillFileItem | SkillFolderItem;

/**
 * TreeDataProvider for the Skill Library sidebar
 */
export class SkillLibraryProvider implements vscode.TreeDataProvider<LibraryTreeItem>, vscode.TreeDragAndDropController<SkillTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<LibraryTreeItem | undefined | null>();
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

  getTreeItem(element: LibraryTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: LibraryTreeItem): Promise<LibraryTreeItem[]> {
    // Expanding a SkillTreeItem → show top-level files/folders
    if (element instanceof SkillTreeItem) {
      return SkillLibraryProvider.buildChildEntries(element.skill, '');
    }

    // Expanding a SkillFolderItem → show its direct children
    if (element instanceof SkillFolderItem) {
      return SkillLibraryProvider.buildChildEntries(element.skill, element.relativeDir);
    }

    // SkillFileItem has no children
    if (element instanceof SkillFileItem) {
      return [];
    }

    // Root level: return skill items
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
        case 'mostUsed':
          return ((b.installCount ?? 0) - (a.installCount ?? 0))
            || a.metadata.name.localeCompare(b.metadata.name);
        default: // 'name'
          return a.metadata.name.localeCompare(b.metadata.name);
      }
    });

    return this._skills.map(skill => new SkillTreeItem(skill, 'library'));
  }

  /**
   * Build the direct child entries (files + folders) for a given prefix
   * inside a skill directory.
   *
   * @param skill   The skill whose additionalFiles to inspect
   * @param prefix  Relative directory prefix (empty string for root, or "scripts/" etc.)
   */
  static buildChildEntries(skill: Skill, prefix: string): LibraryTreeItem[] {
    const items: LibraryTreeItem[] = [];
    const seenDirs = new Set<string>();

    // At root level always show SKILL.md first
    if (!prefix) {
      items.push(new SkillFileItem(skill, 'SKILL.md', skill.filePath, 'SKILL.md'));
    }

    const all = skill.additionalFiles ?? [];
    for (const rel of all) {
      // Only consider entries directly under `prefix`
      if (prefix && !rel.startsWith(prefix)) { continue; }

      const rest = prefix ? rel.slice(prefix.length) : rel;
      if (!rest) { continue; } // skip the directory marker itself
      // Skip entries that are deeper (contain another /)
      // but extract first-level dir names
      const slashIdx = rest.indexOf('/');
      if (slashIdx >= 0) {
        // This is either a directory marker ("scripts/") or a nested file ("scripts/a.sh")
        const dirName = rest.slice(0, slashIdx);
        const dirRel = prefix ? prefix + dirName + '/' : dirName + '/';
        if (!seenDirs.has(dirRel)) {
          seenDirs.add(dirRel);
          items.push(new SkillFolderItem(skill, dirName, dirRel));
        }
      } else {
        // Direct file at this level (no trailing slash)
        items.push(new SkillFileItem(
          skill,
          rest,
          path.join(skill.dirPath, rel),
          rel,
        ));
      }
    }

    return items;
  }
}
