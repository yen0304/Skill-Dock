import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Skill, TARGET_FORMATS, TargetFormat } from '../models/skill';
import { parseFrontmatter } from '../utils/skillParser';
import { SkillTreeItem } from './skillLibraryProvider';

const SKILL_MIME = 'application/vnd.code.tree.skilldock.reposkills';

/**
 * Check if a path exists (async replacement for fs.existsSync)
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * TreeView item for a format group header
 */
class FormatGroupItem extends vscode.TreeItem {
  constructor(
    public readonly format: TargetFormat,
    public readonly skillCount: number,
    public readonly workspaceRoot: string,
  ) {
    const config = TARGET_FORMATS[format];
    super(config.label, vscode.TreeItemCollapsibleState.Expanded);
    this.description = vscode.l10n.t('{0} skill(s)', skillCount);
    this.contextValue = 'formatGroup';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

/**
 * TreeDataProvider for skills found in the current repo/workspace
 */
export class RepoSkillsProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.TreeDragAndDropController<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Drag and drop
  readonly dropMimeTypes: string[] = [];
  readonly dragMimeTypes: string[] = [SKILL_MIME];

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  // --- Drag source ---
  handleDrag(source: readonly vscode.TreeItem[], dataTransfer: vscode.DataTransfer): void {
    const skills = source
      .filter((item): item is SkillTreeItem => item instanceof SkillTreeItem)
      .map((item) => ({
        id: item.skill.id,
        dirPath: item.skill.dirPath,
        filePath: item.skill.filePath,
        name: item.skill.metadata.name,
      }));

    if (skills.length > 0) {
      dataTransfer.set(SKILL_MIME, new vscode.DataTransferItem(JSON.stringify(skills)));
    }
  }

  // Drop not supported on repo view
  handleDrop(): void { /* no-op */ }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    // Top level: show format groups
    if (!element) {
      const items: vscode.TreeItem[] = [];

      for (const [formatKey, config] of Object.entries(TARGET_FORMATS)) {
        const skillsDir = path.join(workspaceRoot, config.skillsDir);
        if (await pathExists(skillsDir)) {
          const skills = await this.scanSkillsDir(skillsDir);
          if (skills.length > 0) {
            items.push(new FormatGroupItem(formatKey as TargetFormat, skills.length, workspaceRoot));
          }
        }
      }

      return items;
    }

    // Children: show skills under each format group
    if (element instanceof FormatGroupItem) {
      const config = TARGET_FORMATS[element.format];
      const skillsDir = path.join(element.workspaceRoot, config.skillsDir);
      const skills = await this.scanSkillsDir(skillsDir);
      return skills.map(skill => new SkillTreeItem(skill, 'repo'));
    }

    return [];
  }

  /**
   * Scan a directory for skills (look for SKILL.md in subdirectories)
   */
  private async scanSkillsDir(skillsDir: string): Promise<Skill[]> {
    const skills: Skill[] = [];

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue;
        }

        const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
        if (!(await pathExists(skillFile))) {
          continue;
        }

        try {
          const content = await fs.readFile(skillFile, 'utf-8');
          const { metadata, body } = parseFrontmatter(content);
          const stat = await fs.stat(skillFile);

          skills.push({
            id: entry.name,
            metadata,
            body,
            dirPath: path.join(skillsDir, entry.name),
            filePath: skillFile,
            lastModified: stat.mtimeMs,
          });
        } catch {
          // Skip invalid skill files
        }
      }
    } catch {
      // Directory not readable
    }

    return skills.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  }
}
