import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * A single entry in the skill-lock file.
 */
export interface SkillLockEntry {
  /** Skill identifier */
  id: string;
  /** Version string from metadata (semver or arbitrary) */
  version: string;
  /** SHA-256 hash of the SKILL.md content */
  contentHash: string;
  /** ISO-8601 timestamp of when the lock entry was created */
  lockedAt: string;
  /** Source id (e.g. marketplace source id or "local") */
  source: string;
}

/**
 * Shape of the lock file on disk.
 */
interface SkillLockFile {
  /** Lock file format version */
  lockVersion: 1;
  /** Map of skill id → lock entry */
  skills: Record<string, SkillLockEntry>;
}

const LOCK_FILENAME = 'skill-lock.json';

/**
 * Service that manages a `skill-lock.json` file in the workspace root.
 *
 * The lock file records the exact version and content hash of each
 * installed skill, enabling:
 * - Deterministic re-install (like package-lock.json / yarn.lock)
 * - Detecting local modifications
 * - Checking for available updates from marketplace sources
 */
export class SkillLockService {
  /** Lock the given skill in the workspace lock file. */
  async lock(
    skillId: string,
    version: string,
    content: string,
    source: string,
  ): Promise<void> {
    const lockPath = this.getLockFilePath();
    if (!lockPath) { return; }

    const lock = await this.readLockFile(lockPath);
    lock.skills[skillId] = {
      id: skillId,
      version,
      contentHash: this.hash(content),
      lockedAt: new Date().toISOString(),
      source,
    };
    await this.writeLockFile(lockPath, lock);
  }

  /** Remove a skill entry from the lock file. */
  async unlock(skillId: string): Promise<void> {
    const lockPath = this.getLockFilePath();
    if (!lockPath) { return; }

    const lock = await this.readLockFile(lockPath);
    delete lock.skills[skillId];
    await this.writeLockFile(lockPath, lock);
  }

  /** Get the lock entry for a specific skill, or undefined if not locked. */
  async getEntry(skillId: string): Promise<SkillLockEntry | undefined> {
    const lockPath = this.getLockFilePath();
    if (!lockPath) { return undefined; }

    const lock = await this.readLockFile(lockPath);
    return lock.skills[skillId];
  }

  /** Get all locked skills. */
  async getAllEntries(): Promise<SkillLockEntry[]> {
    const lockPath = this.getLockFilePath();
    if (!lockPath) { return []; }

    const lock = await this.readLockFile(lockPath);
    return Object.values(lock.skills);
  }

  /**
   * Check if a skill's content has been locally modified since it was locked.
   *
   * @param skillId  The skill identifier
   * @param currentContent  The current SKILL.md content on disk
   * @returns `true` if the content differs from the locked hash, `false` if unchanged
   *          or if the skill is not locked.
   */
  isModified(entry: SkillLockEntry, currentContent: string): boolean {
    return entry.contentHash !== this.hash(currentContent);
  }

  /**
   * Check which locked skills have updates available from a list of remote skills.
   *
   * @param remoteVersions  Map of skill id → latest remote version string
   * @returns Array of skill IDs that have a newer remote version
   */
  async checkForUpdates(
    remoteVersions: Map<string, string>,
  ): Promise<string[]> {
    const entries = await this.getAllEntries();
    const outdated: string[] = [];

    for (const entry of entries) {
      const remote = remoteVersions.get(entry.id);
      if (remote && remote !== entry.version) {
        outdated.push(entry.id);
      }
    }

    return outdated;
  }

  /**
   * Compute SHA-256 hash of content.
   */
  hash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private getLockFilePath(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return null; }
    return path.join(folders[0].uri.fsPath, LOCK_FILENAME);
  }

  private async readLockFile(lockPath: string): Promise<SkillLockFile> {
    try {
      const raw = await fs.readFile(lockPath, 'utf-8');
      const parsed = JSON.parse(raw) as SkillLockFile;
      if (parsed.lockVersion === 1 && parsed.skills) {
        return parsed;
      }
    } catch {
      // File doesn't exist or is invalid — start fresh
    }
    return { lockVersion: 1, skills: {} };
  }

  private async writeLockFile(lockPath: string, lock: SkillLockFile): Promise<void> {
    const content = JSON.stringify(lock, null, 2) + '\n';
    await fs.writeFile(lockPath, content, 'utf-8');
  }
}
