import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let mockLibraryPath = '';

// Mock vscode before importing StorageService
vi.mock('vscode', () => ({
  l10n: {
    t: (msg: string, ...args: unknown[]) => {
      let r = msg;
      args.forEach((a, i) => { r = r.replace(`{${i}}`, String(a)); });
      return r;
    },
  },
  EventEmitter: class {
    private listeners: Array<(...args: unknown[]) => void> = [];
    event = (listener: (...args: unknown[]) => void) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire() { this.listeners.forEach(l => l()); }
    dispose() { this.listeners = []; }
  },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, def?: unknown) => {
        if (key === 'libraryPath') {
          return mockLibraryPath;
        }
        return def;
      },
    }),
  },
}));

import { StorageService } from '../services/storageService';

describe('StorageService', () => {
  let service: StorageService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilldock-test-'));
    // Set the custom library path via the mock config
    mockLibraryPath = path.join(tempDir, 'skills');
    service = new StorageService();
  });

  afterEach(() => {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createSkill', () => {
    it('should create a new skill successfully', async () => {
      const skill = await service.createSkill('test-skill', {
        name: 'Test Skill',
        description: 'A test skill',
      }, '# Hello\n\nContent here');

      expect(skill.id).toBe('test-skill');
      expect(skill.metadata.name).toBe('Test Skill');
      expect(skill.metadata.description).toBe('A test skill');

      // Verify file was created
      const skillFile = path.join(service.libraryPath, 'test-skill', 'SKILL.md');
      expect(fs.existsSync(skillFile)).toBe(true);
    });

    it('should throw when skill already exists', async () => {
      await service.createSkill('existing', {
        name: 'Existing',
        description: 'Already here',
      }, 'Body');

      await expect(
        service.createSkill('existing', {
          name: 'Duplicate',
          description: 'Should fail',
        }, 'Body')
      ).rejects.toThrow('already exists');
    });

    it('should create skill with empty body', async () => {
      const skill = await service.createSkill('empty-body', {
        name: 'Empty Body',
        description: 'No body content',
      }, '');

      expect(skill.id).toBe('empty-body');
      expect(skill.body.trim()).toBe('');
    });

    it('should create skill with all metadata fields', async () => {
      const skill = await service.createSkill('full-skill', {
        name: 'Full Skill',
        description: 'Complete metadata',
        license: 'MIT',
        compatibility: 'claude',
        author: 'tester',
        version: '1.0',
        tags: ['a', 'b'],
      }, '# Content');

      expect(skill.metadata.license).toBe('MIT');
      expect(skill.metadata.author).toBe('tester');
      expect(skill.metadata.version).toBe('1.0');
      expect(skill.metadata.tags).toEqual(['a', 'b']);
    });

    it('should create skill with empty description', async () => {
      const skill = await service.createSkill('empty-desc', {
        name: 'Empty Desc',
        description: '',
      }, 'Body');

      expect(skill.metadata.description).toBe('');
    });
  });

  describe('readSkill', () => {
    it('should return null for non-existent skill', async () => {
      const result = await service.readSkill('nonexistent');
      expect(result).toBeNull();
    });

    it('should read a created skill', async () => {
      await service.createSkill('readable', {
        name: 'Readable',
        description: 'Can be read',
      }, '# Read me');

      const skill = await service.readSkill('readable');
      expect(skill).not.toBeNull();
      expect(skill!.metadata.name).toBe('Readable');
    });
  });

  describe('listSkills', () => {
    it('should return empty array when no skills exist', async () => {
      const skills = await service.listSkills();
      expect(skills).toEqual([]);
    });

    it('should list all skills sorted by name', async () => {
      await service.createSkill('b-skill', { name: 'Beta', description: '' }, '');
      await service.createSkill('a-skill', { name: 'Alpha', description: '' }, '');
      await service.createSkill('c-skill', { name: 'Gamma', description: '' }, '');

      const skills = await service.listSkills();
      expect(skills.length).toBe(3);
      expect(skills[0].metadata.name).toBe('Alpha');
      expect(skills[1].metadata.name).toBe('Beta');
      expect(skills[2].metadata.name).toBe('Gamma');
    });

    it('should skip directories without SKILL.md', async () => {
      await service.createSkill('valid', { name: 'Valid', description: '' }, '');
      // Create a directory without SKILL.md
      const emptyDir = path.join(service.libraryPath, 'invalid');
      fs.mkdirSync(emptyDir, { recursive: true });

      const skills = await service.listSkills();
      expect(skills.length).toBe(1);
      expect(skills[0].id).toBe('valid');
    });

    it('should skip hidden directories', async () => {
      await service.createSkill('visible', { name: 'Visible', description: '' }, '');
      // Create hidden directory
      const hiddenDir = path.join(service.libraryPath, '.hidden');
      fs.mkdirSync(hiddenDir, { recursive: true });
      fs.writeFileSync(path.join(hiddenDir, 'SKILL.md'), '---\nname: Hidden\ndescription: x\n---\n\n');

      const skills = await service.listSkills();
      expect(skills.length).toBe(1);
    });
  });

  describe('updateSkill', () => {
    it('should update an existing skill', async () => {
      await service.createSkill('updatable', { name: 'Original', description: 'V1' }, 'Old body');

      const updated = await service.updateSkill('updatable', {
        name: 'Updated',
        description: 'V2',
      }, 'New body');

      expect(updated.metadata.name).toBe('Updated');
      expect(updated.metadata.description).toBe('V2');
      expect(updated.body.trim()).toBe('New body');
    });

    it('should throw when skill does not exist', async () => {
      await expect(
        service.updateSkill('nonexistent', { name: 'X', description: 'Y' }, 'Z')
      ).rejects.toThrow('not found');
    });
  });

  describe('deleteSkill', () => {
    it('should delete an existing skill', async () => {
      await service.createSkill('deletable', { name: 'Delete Me', description: '' }, '');
      await service.deleteSkill('deletable');

      const result = await service.readSkill('deletable');
      expect(result).toBeNull();
    });

    it('should throw when skill does not exist', async () => {
      await expect(service.deleteSkill('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('duplicateSkill', () => {
    it('should duplicate a skill', async () => {
      await service.createSkill('original', {
        name: 'Original',
        description: 'The original',
        tags: ['test'],
      }, '# Original content');

      const duplicated = await service.duplicateSkill('original', 'the-copy');
      expect(duplicated.id).toBe('the-copy');
      expect(duplicated.metadata.name).toBe('Original');
      expect(duplicated.body.trim()).toBe('# Original content');
    });

    it('should throw when source does not exist', async () => {
      await expect(
        service.duplicateSkill('nonexistent', 'copy')
      ).rejects.toThrow('not found');
    });
  });

  describe('searchSkills', () => {
    beforeEach(async () => {
      await service.createSkill('react-hooks', {
        name: 'React Hooks',
        description: 'Best practices for React hooks',
        tags: ['react', 'frontend'],
      }, '# React Hooks Guide');

      await service.createSkill('python-testing', {
        name: 'Python Testing',
        description: 'Testing with pytest',
        tags: ['python', 'testing'],
      }, '# Python Testing');

      await service.createSkill('docker-setup', {
        name: 'Docker Setup',
        description: 'Docker configuration guide',
        tags: ['docker', 'devops'],
      }, '# Docker Setup');
    });

    it('should search by name', async () => {
      const results = await service.searchSkills('React');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('react-hooks');
    });

    it('should search by description', async () => {
      const results = await service.searchSkills('pytest');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('python-testing');
    });

    it('should search by tags', async () => {
      const results = await service.searchSkills('devops');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('docker-setup');
    });

    it('should search by body content', async () => {
      const results = await service.searchSkills('Guide');
      expect(results.length).toBe(2); // React Hooks Guide + Docker "guide"
    });

    it('should return empty for no match', async () => {
      const results = await service.searchSkills('nonexistent-term');
      expect(results.length).toBe(0);
    });

    it('should be case insensitive', async () => {
      const results = await service.searchSkills('react');
      expect(results.length).toBe(1);
    });
  });

  // ------------------------------------------------------------------
  // Install stats
  // ------------------------------------------------------------------
  describe('recordInstall / getInstalledVersions / listSkills stats merge', () => {
    it('recordInstall should create a stats entry on first call', async () => {
      await service.recordInstall('my-skill', '1.0.0');

      const versions = await service.getInstalledVersions();
      expect(versions.get('my-skill')).toBe('1.0.0');
    });

    it('recordInstall should increment installCount on subsequent calls', async () => {
      await service.recordInstall('counter-skill', '1.0.0');
      await service.recordInstall('counter-skill', '1.0.0');
      await service.recordInstall('counter-skill', '2.0.0');

      // Read raw stats to verify count
      const statsPath = (service as any)._statsPath;
      const raw = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
      expect(raw['counter-skill'].installCount).toBe(3);
      expect(raw['counter-skill'].installedVersion).toBe('2.0.0');
    });

    it('recordInstall without version should preserve existing version', async () => {
      await service.recordInstall('versioned', '1.5.0');
      await service.recordInstall('versioned'); // no version

      const versions = await service.getInstalledVersions();
      expect(versions.get('versioned')).toBe('1.5.0');
    });

    it('getInstalledVersions should return empty map when no stats file', async () => {
      const versions = await service.getInstalledVersions();
      expect(versions.size).toBe(0);
    });

    it('getInstalledVersions should not include skills without a version', async () => {
      await service.recordInstall('no-version'); // no version arg

      const versions = await service.getInstalledVersions();
      expect(versions.has('no-version')).toBe(false);
    });

    it('getInstalledVersions should return all tracked id→version pairs', async () => {
      await service.recordInstall('skill-a', '1.0.0');
      await service.recordInstall('skill-b', '2.3.4');

      const versions = await service.getInstalledVersions();
      expect(versions.get('skill-a')).toBe('1.0.0');
      expect(versions.get('skill-b')).toBe('2.3.4');
      expect(versions.size).toBe(2);
    });

    it('listSkills should merge installCount and lastInstalledAt into skills', async () => {
      await service.createSkill('tracked-skill', { name: 'Tracked', description: '' }, '');
      await service.recordInstall('tracked-skill', '1.0.0');
      await service.recordInstall('tracked-skill', '1.0.0');

      const skills = await service.listSkills();
      const skill = skills.find(s => s.id === 'tracked-skill');
      expect(skill).toBeDefined();
      expect(skill!.installCount).toBe(2);
      expect(skill!.lastInstalledAt).toBeTypeOf('number');
    });

    it('listSkills should leave installCount undefined for skills with no stats', async () => {
      await service.createSkill('untracked', { name: 'Untracked', description: '' }, '');

      const skills = await service.listSkills();
      const skill = skills.find(s => s.id === 'untracked');
      expect(skill!.installCount).toBeUndefined();
      expect(skill!.lastInstalledAt).toBeUndefined();
    });
  });

  describe('importFromPath', () => {
    it('should import skill from external path', async () => {
      // Create external skill directory
      const externalDir = path.join(tempDir, 'external-skill');
      fs.mkdirSync(externalDir, { recursive: true });
      fs.writeFileSync(
        path.join(externalDir, 'SKILL.md'),
        '---\nname: External\ndescription: From outside\n---\n\n# External Content\n'
      );

      const imported = await service.importFromPath(externalDir);
      expect(imported.metadata.name).toBe('External');
    });

    it('should throw when no SKILL.md found', async () => {
      const emptyDir = path.join(tempDir, 'empty-import');
      fs.mkdirSync(emptyDir, { recursive: true });

      await expect(service.importFromPath(emptyDir)).rejects.toThrow('No SKILL.md');
    });

    it('should handle name collisions by appending counter', async () => {
      // Create a skill that will collide
      await service.createSkill('collider', { name: 'Collider', description: '' }, '');

      // Create external skill with same dir name
      const externalDir = path.join(tempDir, 'collider');
      fs.mkdirSync(externalDir, { recursive: true });
      fs.writeFileSync(
        path.join(externalDir, 'SKILL.md'),
        '---\nname: Collider External\ndescription: External version\n---\n\n# Content\n'
      );

      const imported = await service.importFromPath(externalDir);
      expect(imported.id).toBe('collider-1');
    });
  });
});
