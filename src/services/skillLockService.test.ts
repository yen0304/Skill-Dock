import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillLockService } from './skillLockService';

vi.mock('vscode', async () => {
  const actual = await vi.importActual<typeof import('vscode')>('vscode');
  return {
    ...actual,
    workspace: {
      ...actual.workspace,
      workspaceFolders: undefined as unknown,
    },
  };
});

import { workspace } from 'vscode';

describe('SkillLockService', () => {
  let tmpDir: string;
  let service: SkillLockService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));
    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];
    service = new SkillLockService();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    (workspace as any).workspaceFolders = undefined;
  });

  describe('lock', () => {
    it('should create lock file with entry', async () => {
      await service.lock('my-skill', '1.0.0', '# My Skill', 'anthropics/skills');

      const lockPath = path.join(tmpDir, 'skill-lock.json');
      expect(fs.existsSync(lockPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      expect(data.lockVersion).toBe(1);
      expect(data.skills['my-skill']).toBeDefined();
      expect(data.skills['my-skill'].version).toBe('1.0.0');
      expect(data.skills['my-skill'].source).toBe('anthropics/skills');
    });

    it('should append entries to existing lock file', async () => {
      await service.lock('skill-a', '1.0', 'A', 'source');
      await service.lock('skill-b', '2.0', 'B', 'source');

      const entry = await service.getEntry('skill-a');
      expect(entry).toBeDefined();
      expect(entry!.version).toBe('1.0');

      const entryB = await service.getEntry('skill-b');
      expect(entryB).toBeDefined();
      expect(entryB!.version).toBe('2.0');
    });

    it('should overwrite existing entry for same skill', async () => {
      await service.lock('my-skill', '1.0.0', 'old', 'source');
      await service.lock('my-skill', '2.0.0', 'new', 'source');

      const entry = await service.getEntry('my-skill');
      expect(entry!.version).toBe('2.0.0');
    });
  });

  describe('unlock', () => {
    it('should remove entry from lock file', async () => {
      await service.lock('my-skill', '1.0.0', 'content', 'source');
      await service.unlock('my-skill');

      const entry = await service.getEntry('my-skill');
      expect(entry).toBeUndefined();
    });

    it('should be safe to unlock non-existent skill', async () => {
      await expect(service.unlock('nope')).resolves.not.toThrow();
    });
  });

  describe('getAllEntries', () => {
    it('should return all locked skills', async () => {
      await service.lock('a', '1', 'a', 's');
      await service.lock('b', '2', 'b', 's');

      const entries = await service.getAllEntries();
      expect(entries).toHaveLength(2);
    });

    it('should return empty array when no workspace', async () => {
      (workspace as any).workspaceFolders = undefined;
      const entries = await service.getAllEntries();
      expect(entries).toEqual([]);
    });
  });

  describe('isModified', () => {
    it('should detect modified content', async () => {
      await service.lock('my-skill', '1.0', 'original', 'source');
      const entry = (await service.getEntry('my-skill'))!;

      expect(service.isModified(entry, 'modified')).toBe(true);
      expect(service.isModified(entry, 'original')).toBe(false);
    });
  });

  describe('checkForUpdates', () => {
    it('should find skills with newer remote versions', async () => {
      await service.lock('skill-a', '1.0', 'a', 's');
      await service.lock('skill-b', '2.0', 'b', 's');

      const remoteVersions = new Map([
        ['skill-a', '1.1'], // updated
        ['skill-b', '2.0'], // same
      ]);

      const outdated = await service.checkForUpdates(remoteVersions);
      expect(outdated).toEqual(['skill-a']);
    });

    it('should return empty when all up to date', async () => {
      await service.lock('skill-a', '1.0', 'a', 's');

      const remoteVersions = new Map([['skill-a', '1.0']]);
      const outdated = await service.checkForUpdates(remoteVersions);
      expect(outdated).toEqual([]);
    });
  });

  describe('hash', () => {
    it('should produce consistent SHA-256 hashes', () => {
      const h1 = service.hash('hello');
      const h2 = service.hash('hello');
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(64); // SHA-256 hex length
    });

    it('should produce different hashes for different content', () => {
      expect(service.hash('a')).not.toBe(service.hash('b'));
    });
  });
});
