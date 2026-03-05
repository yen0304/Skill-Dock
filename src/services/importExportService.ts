import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Skill, TargetFormat, TARGET_FORMATS } from '../models/skill';
import { StorageService } from './storageService';
import { sanitizeName, isPathSafe } from '../utils/pathSafety';

/** Installation mode: symlink (recommended) or copy */
export type InstallMode = 'symlink' | 'copy';

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
 * Service for importing skills into repos and exporting skills from repos
 */
export class ImportExportService {
  constructor(private storageService: StorageService) {}

  /**
   * Import a skill from the library into the current workspace.
   * Supports both copy and symlink modes.
   */
  async importToRepo(
    skill: Skill,
    format: TargetFormat,
    mode?: InstallMode,
  ): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error(vscode.l10n.t('No workspace folder open'));
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const config = TARGET_FORMATS[format];
    const safeId = sanitizeName(skill.id);
    const targetDir = path.join(workspaceRoot, config.skillsDir, safeId);

    // Validate path safety
    const skillsBase = path.join(workspaceRoot, config.skillsDir);
    if (!isPathSafe(skillsBase, targetDir)) {
      throw new Error(vscode.l10n.t('Invalid skill ID: path traversal detected'));
    }

    // Check if skill already exists
    if (await pathExists(targetDir)) {
      const overwrite = await vscode.window.showWarningMessage(
        vscode.l10n.t('Skill "{0}" already exists in {1}. Overwrite?', skill.metadata.name, config.skillsDir),
        vscode.l10n.t('Overwrite'),
        vscode.l10n.t('Cancel')
      );
      if (overwrite !== vscode.l10n.t('Overwrite')) {
        throw new Error('Import cancelled');
      }
      await fs.rm(targetDir, { recursive: true, force: true });
    }

    // Resolve install mode from parameter, settings, or default
    const resolvedMode = mode ?? this.getConfiguredInstallMode();

    if (resolvedMode === 'symlink') {
      await this.createSymlink(skill.dirPath, targetDir);
    } else {
      await this.copyDirectory(skill.dirPath, targetDir);
    }

    // Create scaffold directories if specified by the format
    if (config.scaffoldDirs) {
      for (const dir of config.scaffoldDirs) {
        const scaffoldPath = path.join(targetDir, dir);
        if (!(await pathExists(scaffoldPath))) {
          await fs.mkdir(scaffoldPath, { recursive: true });
        }
      }
    }

    return targetDir;
  }

  /**
   * Import a skill to multiple agent formats at once (canonical copy + symlinks).
   * Creates a single canonical copy then symlinks from each agent directory.
   */
  async importToMultipleFormats(
    skill: Skill,
    formats: TargetFormat[],
  ): Promise<string[]> {
    if (formats.length === 0) { return []; }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error(vscode.l10n.t('No workspace folder open'));
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const safeId = sanitizeName(skill.id);

    // Use canonical .agents/skills as the primary copy location
    const canonicalDir = path.join(workspaceRoot, '.agents', 'skills', safeId);
    await fs.mkdir(path.dirname(canonicalDir), { recursive: true });

    if (await pathExists(canonicalDir)) {
      await fs.rm(canonicalDir, { recursive: true, force: true });
    }
    await this.copyDirectory(skill.dirPath, canonicalDir);

    const results: string[] = [canonicalDir];
    const seenDirs = new Set<string>([canonicalDir]);

    for (const format of formats) {
      const config = TARGET_FORMATS[format];
      const targetDir = path.join(workspaceRoot, config.skillsDir, safeId);

      if (seenDirs.has(targetDir)) { continue; }
      seenDirs.add(targetDir);

      if (await pathExists(targetDir)) {
        await fs.rm(targetDir, { recursive: true, force: true });
      }

      try {
        await this.createSymlink(canonicalDir, targetDir);
        results.push(targetDir);
      } catch {
        // Fall back to copy if symlink fails
        await this.copyDirectory(canonicalDir, targetDir);
        results.push(targetDir);
      }
    }

    return results;
  }

  /**
   * Import multiple skills at once
   */
  async importMultipleToRepo(
    skills: Skill[],
    format: TargetFormat,
    mode?: InstallMode,
  ): Promise<string[]> {
    const results: string[] = [];
    for (const skill of skills) {
      const targetDir = await this.importToRepo(skill, format, mode);
      results.push(targetDir);
    }
    return results;
  }

  /**
   * Save a skill from the repo to the local library
   */
  async exportToLibrary(skill: Skill): Promise<Skill> {
    return this.storageService.importFromPath(skill.dirPath);
  }

  /**
   * Prompt user to pick skills and target format, then import
   */
  async interactiveImport(): Promise<void> {
    const skills = await this.storageService.listSkills();
    if (skills.length === 0) {
      vscode.window.showInformationMessage(
        vscode.l10n.t('Your skill library is empty. Create a skill first.')
      );
      return;
    }

    // Step 1: Pick skills
    const items = skills.map(skill => ({
      label: skill.metadata.name,
      description: skill.metadata.description,
      detail: skill.id,
      skill,
      picked: false,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: vscode.l10n.t('Select skills to import'),
      canPickMany: true,
    });

    if (!selected || selected.length === 0) {
      return;
    }

    // Step 2: Pick target format
    const format = await this.pickTargetFormat();
    if (!format) {
      return;
    }

    // Step 3: Import
    try {
      const results = await this.importMultipleToRepo(
        selected.map(s => s.skill),
        format
      );
      vscode.window.showInformationMessage(
        vscode.l10n.t('Successfully imported {0} skill(s) to {1}', results.length, TARGET_FORMATS[format].skillsDir)
      );
    } catch (err) {
      if ((err as Error).message !== 'Import cancelled') {
        vscode.window.showErrorMessage(
          vscode.l10n.t('Import failed: {0}', String(err))
        );
      }
    }
  }

  /**
   * Show quick pick for target format selection
   */
  async pickTargetFormat(): Promise<TargetFormat | undefined> {
    const defaultTarget = vscode.workspace
      .getConfiguration('skilldock')
      .get<TargetFormat>('defaultTarget', 'claude');

    const items = Object.entries(TARGET_FORMATS).map(([key, config]) => ({
      label: config.label,
      description: key === defaultTarget ? vscode.l10n.t('(default)') : '',
      detail: config.description,
      format: key as TargetFormat,
    }));

    // Put default on top
    items.sort((a, b) => {
      if (a.format === defaultTarget) { return -1; }
      if (b.format === defaultTarget) { return 1; }
      return 0;
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: vscode.l10n.t('Select target format'),
    });

    return selected?.format;
  }

  /**
   * Show quick pick for install mode selection
   */
  async pickInstallMode(): Promise<InstallMode | undefined> {
    const items: Array<{ label: string; description: string; detail: string; mode: InstallMode }> = [
      {
        label: vscode.l10n.t('Symlink (Recommended)'),
        description: '',
        detail: vscode.l10n.t('Creates symlinks to a canonical copy. Single source of truth, easy updates.'),
        mode: 'symlink',
      },
      {
        label: vscode.l10n.t('Copy'),
        description: '',
        detail: vscode.l10n.t('Creates independent copies. Use when symlinks are not supported.'),
        mode: 'copy',
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: vscode.l10n.t('Select install mode'),
    });

    return selected?.mode;
  }

  /**
   * Read the configured default install mode from settings
   */
  private getConfiguredInstallMode(): InstallMode {
    const config = vscode.workspace.getConfiguration('skilldock');
    const mode = config.get<string>('installMode', 'copy');
    return mode === 'symlink' ? 'symlink' : 'copy';
  }

  /**
   * Create a symlink, falling back to copy on failure
   */
  private async createSymlink(source: string, target: string): Promise<void> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.symlink(source, target, 'junction');
    } catch {
      // Fall back to directory symlink on non-Windows
      try {
        await fs.symlink(source, target, 'dir');
      } catch {
        // Ultimate fallback: copy
        await this.copyDirectory(source, target);
      }
    }
  }

  /**
   * Recursively copy a directory
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    if (!(await pathExists(dest))) {
      await fs.mkdir(dest, { recursive: true });
    }

    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}
