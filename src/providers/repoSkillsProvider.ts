import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Skill, TARGET_FORMATS, TargetFormat, ALL_SKILL_DIRS } from '../models/skill';
import { parseFrontmatter } from '../utils/skillParser';
import { SkillTreeItem, SkillFileItem, SkillFolderItem, SkillLibraryProvider } from './skillLibraryProvider';

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
 * TreeView item for a format group header.
 * Groups by unique skillsDir path rather than by agent format, since
 * many agents (Cursor, Codex, Cline, Copilot, etc.) share `.agents/skills`.
 */
class FormatGroupItem extends vscode.TreeItem {
  constructor(
    public readonly format: TargetFormat,
    /** All formats that share this skillsDir */
    public readonly relatedFormats: TargetFormat[],
    public readonly skillCount: number,
    public readonly workspaceRoot: string,
  ) {
    const config = TARGET_FORMATS[format];
    // Build a concise label showing the dir and which agents share it
    const agentNames = relatedFormats.map((f) => TARGET_FORMATS[f].id);
    const label = agentNames.length > 1
      ? `${config.skillsDir} (${agentNames.slice(0, 3).join(', ')}${agentNames.length > 3 ? '…' : ''})`
      : config.label;
    super(label, vscode.TreeItemCollapsibleState.Expanded);
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

    // Top level: group by unique skillsDir to avoid scanning the same path multiple times
    if (!element) {
      const items: vscode.TreeItem[] = [];
      const seen = new Set<string>();

      // Group formats by their skillsDir
      const dirToFormats = new Map<string, TargetFormat[]>();
      for (const [key, config] of Object.entries(TARGET_FORMATS)) {
        const existing = dirToFormats.get(config.skillsDir) ?? [];
        existing.push(key as TargetFormat);
        dirToFormats.set(config.skillsDir, existing);
      }

      for (const [skillsDir, formats] of dirToFormats) {
        if (seen.has(skillsDir)) { continue; }
        seen.add(skillsDir);

        const fullDir = path.join(workspaceRoot, skillsDir);
        if (await pathExists(fullDir)) {
          const skills = await this.scanSkillsDir(fullDir);
          if (skills.length > 0) {
            items.push(new FormatGroupItem(formats[0], formats, skills.length, workspaceRoot));
          }
        }
      }

      return items;
    }

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

          // Collect additional files recursively
          const skillDir = path.join(skillsDir, entry.name);
          const additionalFiles: string[] = [];
          const scanDir = async (dir: string, prefix: string): Promise<void> => {
            const dirEntries = await fs.readdir(dir, { withFileTypes: true });
            for (const de of dirEntries) {
              const rel = prefix ? `${prefix}/${de.name}` : de.name;
              if (de.name === 'SKILL.md' && !prefix) { continue; }
              if (de.isDirectory()) {
                additionalFiles.push(rel + '/');
                await scanDir(path.join(dir, de.name), rel);
              } else {
                additionalFiles.push(rel);
              }
            }
          };
          await scanDir(skillDir, '');

          skills.push({
            id: entry.name,
            metadata,
            body,
            dirPath: skillDir,
            filePath: skillFile,
            lastModified: stat.mtimeMs,
            additionalFiles: additionalFiles.length > 0 ? additionalFiles : undefined,
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
