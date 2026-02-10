import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Skill, SkillMetadata } from '../models/skill';
import { parseFrontmatter, serializeSkill } from '../utils/skillParser';

/**
 * Service for managing local skill storage (CRUD operations)
 */
export class StorageService {
  private _libraryPath: string;
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor() {
    this._libraryPath = this.resolveLibraryPath();
    this.ensureDirectory(this._libraryPath);
  }

  get libraryPath(): string {
    return this._libraryPath;
  }

  /**
   * Resolve the library path from settings or use default
   */
  private resolveLibraryPath(): string {
    const config = vscode.workspace.getConfiguration('skilldock');
    const customPath = config.get<string>('libraryPath');

    if (customPath && customPath.trim() !== '') {
      return customPath.startsWith('~')
        ? path.join(os.homedir(), customPath.slice(1))
        : customPath;
    }

    return path.join(os.homedir(), '.skilldock', 'skills');
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  private ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * List all skills in the library
   */
  async listSkills(): Promise<Skill[]> {
    this._libraryPath = this.resolveLibraryPath();
    this.ensureDirectory(this._libraryPath);

    const entries = fs.readdirSync(this._libraryPath, { withFileTypes: true });
    const skills: Skill[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }

      const skillDir = path.join(this._libraryPath, entry.name);
      const skillFile = path.join(skillDir, 'SKILL.md');

      if (!fs.existsSync(skillFile)) {
        continue;
      }

      try {
        const skill = await this.readSkill(entry.name);
        if (skill) {
          skills.push(skill);
        }
      } catch {
        // Skip invalid skills
      }
    }

    return skills.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  }

  /**
   * Read a single skill by ID
   */
  async readSkill(id: string): Promise<Skill | null> {
    const skillDir = path.join(this._libraryPath, id);
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillFile)) {
      return null;
    }

    const content = fs.readFileSync(skillFile, 'utf-8');
    const { metadata, body } = parseFrontmatter(content);
    const stat = fs.statSync(skillFile);

    // Find additional files
    const additionalFiles: string[] = [];
    const allEntries = fs.readdirSync(skillDir);
    for (const entry of allEntries) {
      if (entry !== 'SKILL.md') {
        additionalFiles.push(entry);
      }
    }

    return {
      id,
      metadata,
      body,
      dirPath: skillDir,
      filePath: skillFile,
      lastModified: stat.mtimeMs,
      additionalFiles: additionalFiles.length > 0 ? additionalFiles : undefined,
    };
  }

  /**
   * Create a new skill
   */
  async createSkill(id: string, metadata: SkillMetadata, body: string): Promise<Skill> {
    const skillDir = path.join(this._libraryPath, id);

    if (fs.existsSync(skillDir)) {
      throw new Error(vscode.l10n.t('Skill "{0}" already exists', id));
    }

    this.ensureDirectory(skillDir);

    const content = serializeSkill(metadata, body);
    const skillFile = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillFile, content, 'utf-8');

    this._onDidChange.fire();

    const created = await this.readSkill(id);
    if (!created) {
      throw new Error(vscode.l10n.t('Skill "{0}" not found', id));
    }
    return created;
  }

  /**
   * Update an existing skill
   */
  async updateSkill(id: string, metadata: SkillMetadata, body: string): Promise<Skill> {
    const skillDir = path.join(this._libraryPath, id);
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillFile)) {
      throw new Error(vscode.l10n.t('Skill "{0}" not found', id));
    }

    const content = serializeSkill(metadata, body);
    fs.writeFileSync(skillFile, content, 'utf-8');

    this._onDidChange.fire();

    const updated = await this.readSkill(id);
    if (!updated) {
      throw new Error(vscode.l10n.t('Skill "{0}" not found', id));
    }
    return updated;
  }

  /**
   * Delete a skill
   */
  async deleteSkill(id: string): Promise<void> {
    const skillDir = path.join(this._libraryPath, id);

    if (!fs.existsSync(skillDir)) {
      throw new Error(vscode.l10n.t('Skill "{0}" not found', id));
    }

    fs.rmSync(skillDir, { recursive: true, force: true });
    this._onDidChange.fire();
  }

  /**
   * Duplicate a skill
   */
  async duplicateSkill(sourceId: string, newId: string): Promise<Skill> {
    const source = await this.readSkill(sourceId);
    if (!source) {
      throw new Error(vscode.l10n.t('Source skill "{0}" not found', sourceId));
    }

    const newDir = path.join(this._libraryPath, newId);
    this.copyDirectorySync(source.dirPath, newDir);

    this._onDidChange.fire();

    const duplicated = await this.readSkill(newId);
    if (!duplicated) {
      throw new Error(vscode.l10n.t('Skill "{0}" not found', newId));
    }
    return duplicated;
  }

  /**
   * Import a skill from an arbitrary path (e.g., from a repo)
   */
  async importFromPath(skillDir: string): Promise<Skill> {
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillFile)) {
      throw new Error(vscode.l10n.t('No SKILL.md found at {0}', skillDir));
    }

    const dirName = path.basename(skillDir);
    let targetId = dirName;

    // Handle name collisions
    let counter = 1;
    while (fs.existsSync(path.join(this._libraryPath, targetId))) {
      targetId = `${dirName}-${counter}`;
      counter++;
    }

    const targetDir = path.join(this._libraryPath, targetId);
    this.copyDirectorySync(skillDir, targetDir);

    this._onDidChange.fire();

    const imported = await this.readSkill(targetId);
    if (!imported) {
      throw new Error(vscode.l10n.t('Skill "{0}" not found', targetId));
    }
    return imported;
  }

  /**
   * Search skills by name or description
   */
  async searchSkills(query: string): Promise<Skill[]> {
    const allSkills = await this.listSkills();
    const lowerQuery = query.toLowerCase();

    return allSkills.filter(skill => {
      const nameMatch = skill.metadata.name.toLowerCase().includes(lowerQuery);
      const descMatch = skill.metadata.description.toLowerCase().includes(lowerQuery);
      const tagMatch = skill.metadata.tags?.some(t => t.toLowerCase().includes(lowerQuery));
      const bodyMatch = skill.body.toLowerCase().includes(lowerQuery);
      return nameMatch || descMatch || tagMatch || bodyMatch;
    });
  }

  /**
   * Recursively copy a directory
   */
  private copyDirectorySync(src: string, dest: string): void {
    this.ensureDirectory(dest);
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

  dispose(): void {
    this._onDidChange.dispose();
  }
}
