import * as vscode from 'vscode';
import { Skill } from '../models/skill';
import { StorageService } from '../services/storageService';

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
export class SkillLibraryProvider implements vscode.TreeDataProvider<SkillTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SkillTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _skills: Skill[] = [];
  private _filterText = '';

  constructor(private storageService: StorageService) {
    // Listen for storage changes
    storageService.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setFilter(text: string): void {
    this._filterText = text;
    this.refresh();
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

    return this._skills.map(skill => new SkillTreeItem(skill, 'library'));
  }
}
