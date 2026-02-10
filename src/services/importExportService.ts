import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Skill, TargetFormat, TARGET_FORMATS } from '../models/skill';
import { StorageService } from './storageService';

/**
 * Service for importing skills into repos and exporting skills from repos
 */
export class ImportExportService {
  constructor(private storageService: StorageService) {}

  /**
   * Import a skill from the library into the current workspace
   */
  async importToRepo(skill: Skill, format: TargetFormat): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error(vscode.l10n.t('No workspace folder open'));
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const config = TARGET_FORMATS[format];
    const targetDir = path.join(workspaceRoot, config.skillsDir, skill.id);

    // Check if skill already exists
    if (fs.existsSync(targetDir)) {
      const overwrite = await vscode.window.showWarningMessage(
        vscode.l10n.t('Skill "{0}" already exists in {1}. Overwrite?', skill.metadata.name, config.skillsDir),
        vscode.l10n.t('Overwrite'),
        vscode.l10n.t('Cancel')
      );
      if (overwrite !== vscode.l10n.t('Overwrite')) {
        throw new Error('Import cancelled');
      }
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    // Copy skill directory
    this.copyDirectorySync(skill.dirPath, targetDir);

    // Create scaffold directories for codex format
    if (config.scaffoldDirs) {
      for (const dir of config.scaffoldDirs) {
        const scaffoldPath = path.join(targetDir, dir);
        if (!fs.existsSync(scaffoldPath)) {
          fs.mkdirSync(scaffoldPath, { recursive: true });
        }
      }
    }

    return targetDir;
  }

  /**
   * Import multiple skills at once
   */
  async importMultipleToRepo(skills: Skill[], format: TargetFormat): Promise<string[]> {
    const results: string[] = [];
    for (const skill of skills) {
      const targetDir = await this.importToRepo(skill, format);
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
   * Recursively copy a directory
   */
  private copyDirectorySync(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirectorySync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
