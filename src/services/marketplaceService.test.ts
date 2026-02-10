import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

let mockLibraryPath = '';
let mockMarketplaceSources: string[] = [];
let mockGlobalUpdate = vi.fn();

// Mock vscode
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
        if (key === 'libraryPath') { return mockLibraryPath; }
        if (key === 'marketplaceSources') { return mockMarketplaceSources; }
        return def;
      },
      update: mockGlobalUpdate,
    }),
  },
  window: {
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
}));

vi.mock('https', () => ({
  get: vi.fn(),
}));

import * as https from 'https';

import { MarketplaceService } from './marketplaceService';
import { MarketplaceSource, BUILTIN_MARKETPLACE_SOURCES } from '../models/skill';
import { StorageService } from './storageService';

// ============================================================
// Tests
// ============================================================

describe('MarketplaceService', () => {
  let tmpDir: string;
  let storageService: StorageService;
  let service: MarketplaceService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'market-test-'));
    mockLibraryPath = tmpDir;
    mockMarketplaceSources = [];
    mockGlobalUpdate = vi.fn().mockResolvedValue(undefined);
    storageService = new StorageService();
    service = new MarketplaceService(storageService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------------
  // parseGitHubUrl
  // ----------------------------------------------------------
  describe('parseGitHubUrl', () => {
    it('should parse a simple GitHub URL', () => {
      const result = MarketplaceService.parseGitHubUrl('https://github.com/anthropics/skills');
      expect(result).not.toBeNull();
      expect(result!.owner).toBe('anthropics');
      expect(result!.repo).toBe('skills');
      expect(result!.branch).toBe('main');
      expect(result!.path).toBe('');
      expect(result!.id).toBe('anthropics/skills');
    });

    it('should parse a URL with tree/branch/path', () => {
      const result = MarketplaceService.parseGitHubUrl(
        'https://github.com/github/awesome-copilot/tree/main/skills'
      );
      expect(result).not.toBeNull();
      expect(result!.owner).toBe('github');
      expect(result!.repo).toBe('awesome-copilot');
      expect(result!.branch).toBe('main');
      expect(result!.path).toBe('skills');
      expect(result!.id).toBe('github/awesome-copilot/skills');
    });

    it('should parse a URL with a non-main branch', () => {
      const result = MarketplaceService.parseGitHubUrl(
        'https://github.com/owner/repo/tree/develop/some/nested/path'
      );
      expect(result).not.toBeNull();
      expect(result!.branch).toBe('develop');
      expect(result!.path).toBe('some/nested/path');
    });

    it('should parse short form owner/repo', () => {
      const result = MarketplaceService.parseGitHubUrl('myorg/myrepo');
      expect(result).not.toBeNull();
      expect(result!.owner).toBe('myorg');
      expect(result!.repo).toBe('myrepo');
      expect(result!.branch).toBe('main');
    });

    it('should return null for invalid URL', () => {
      expect(MarketplaceService.parseGitHubUrl('just-text')).toBeNull();
      expect(MarketplaceService.parseGitHubUrl('https://gitlab.com/foo/bar')).toBeNull();
      expect(MarketplaceService.parseGitHubUrl('')).toBeNull();
    });

    it('should strip trailing slashes', () => {
      const result = MarketplaceService.parseGitHubUrl('https://github.com/owner/repo/');
      expect(result).not.toBeNull();
      expect(result!.owner).toBe('owner');
      expect(result!.repo).toBe('repo');
    });

    it('should set isBuiltin to false for parsed URLs', () => {
      const result = MarketplaceService.parseGitHubUrl('https://github.com/foo/bar');
      expect(result!.isBuiltin).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // Source management
  // ----------------------------------------------------------
  describe('getSources', () => {
    it('should include all builtin sources', () => {
      const sources = service.getSources();
      expect(sources.length).toBe(BUILTIN_MARKETPLACE_SOURCES.length);
      expect(sources[0].id).toBe('anthropics/skills');
    });

    it('should include custom sources from settings', () => {
      mockMarketplaceSources = ['https://github.com/myorg/myskills'];
      const sources = service.getSources();
      expect(sources.length).toBe(BUILTIN_MARKETPLACE_SOURCES.length + 1);
      expect(sources[sources.length - 1].owner).toBe('myorg');
      expect(sources[sources.length - 1].repo).toBe('myskills');
    });

    it('should skip invalid custom URLs', () => {
      mockMarketplaceSources = ['not-a-valid-url'];
      const sources = service.getSources();
      expect(sources.length).toBe(BUILTIN_MARKETPLACE_SOURCES.length);
    });
  });

  describe('addCustomSource', () => {
    it('should call config update with the new URL', async () => {
      await service.addCustomSource('https://github.com/org/repo');
      expect(mockGlobalUpdate).toHaveBeenCalledWith(
        'marketplaceSources',
        ['https://github.com/org/repo'],
        1 // ConfigurationTarget.Global
      );
    });

    it('should reject duplicate URLs', async () => {
      mockMarketplaceSources = ['https://github.com/org/repo'];
      await expect(
        service.addCustomSource('https://github.com/org/repo')
      ).rejects.toThrow('Source already exists');
    });

    it('should reject invalid URLs', async () => {
      await expect(service.addCustomSource('invalid')).rejects.toThrow('Invalid GitHub URL');
    });
  });

  describe('removeCustomSource', () => {
    it('should filter out the source and update config', async () => {
      mockMarketplaceSources = [
        'https://github.com/org/repo',
        'https://github.com/other/skills',
      ];
      await service.removeCustomSource('org/repo');
      expect(mockGlobalUpdate).toHaveBeenCalledWith(
        'marketplaceSources',
        ['https://github.com/other/skills'],
        1
      );
    });
  });

  // ----------------------------------------------------------
  // Cache management
  // ----------------------------------------------------------
  describe('clearCache', () => {
    it('should clear the cache without error', () => {
      expect(() => service.clearCache()).not.toThrow();
    });
  });

  // ----------------------------------------------------------
  // getInstalledIds
  // ----------------------------------------------------------
  describe('getInstalledIds', () => {
    it('should return installed skill IDs', async () => {
      // Create a skill in the library
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: Test Skill\ndescription: A test\n---\nHello'
      );

      const ids = await service.getInstalledIds();
      expect(ids.has('test-skill')).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // installSkill
  // ----------------------------------------------------------
  describe('installSkill', () => {
    it('should install a new skill to library', async () => {
      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'remote-skill',
        metadata: { name: 'Remote Skill', description: 'From remote', author: 'Author', version: '1.0', tags: ['remote'] },
        body: '# Remote Skill\n\nContent here',
        repoPath: 'skills/remote-skill/SKILL.md',
        downloadUrl: 'https://raw.githubusercontent.com/...',
      };

      await service.installSkill(remote);

      // Verify skill was created
      const skill = await storageService.readSkill('remote-skill');
      expect(skill).not.toBeNull();
      expect(skill!.metadata.name).toBe('Remote Skill');
    });

    it('should overwrite existing skill when user confirms', async () => {
      // Create skill first
      const skillDir = path.join(tmpDir, 'existing-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: Existing Skill\ndescription: Old\n---\nOld body'
      );

      const vscodeModule = await import('vscode');
      vi.mocked(vscodeModule.window.showWarningMessage).mockResolvedValue('Overwrite' as any);

      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'existing-skill',
        metadata: { name: 'Updated Skill', description: 'New desc' },
        body: '# Updated\nNew content',
        repoPath: 'skills/existing-skill/SKILL.md',
        downloadUrl: 'https://...',
      };

      await service.installSkill(remote);

      const skill = await storageService.readSkill('existing-skill');
      expect(skill!.metadata.name).toBe('Updated Skill');
    });

    it('should not overwrite when user cancels', async () => {
      const skillDir = path.join(tmpDir, 'keep-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: Keep Skill\ndescription: Keep\n---\nKeep body'
      );

      const vscodeModule = await import('vscode');
      vi.mocked(vscodeModule.window.showWarningMessage).mockResolvedValue('Cancel' as any);

      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'keep-skill',
        metadata: { name: 'Changed', description: 'Change' },
        body: '# Changed',
        repoPath: 'skills/keep-skill/SKILL.md',
        downloadUrl: 'https://...',
      };

      await service.installSkill(remote);

      const skill = await storageService.readSkill('keep-skill');
      expect(skill!.metadata.name).toBe('Keep Skill');
    });

    it('should install skill without optional fields', async () => {
      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'minimal-remote',
        metadata: { name: 'Minimal', description: 'Basic' },
        body: 'Body only',
        repoPath: 'skills/minimal-remote/SKILL.md',
        downloadUrl: 'https://...',
      };

      await service.installSkill(remote);
      const skill = await storageService.readSkill('minimal-remote');
      expect(skill).not.toBeNull();
    });

    it('should install skill with license field', async () => {
      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'licensed-skill',
        metadata: { name: 'Licensed', description: 'Has license', license: 'MIT' },
        body: 'Licensed body',
        repoPath: 'skills/licensed-skill/SKILL.md',
        downloadUrl: 'https://...',
      };

      await service.installSkill(remote);
      const skill = await storageService.readSkill('licensed-skill');
      expect(skill).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // Cache behavior
  // ----------------------------------------------------------
  describe('cache', () => {
    it('clearCache should clear all cached entries', () => {
      // Access private cache for testing
      (service as any)._cache.set('test-key', { data: [], timestamp: Date.now() });
      expect((service as any)._cache.size).toBe(1);

      service.clearCache();
      expect((service as any)._cache.size).toBe(0);
    });
  });

  // ----------------------------------------------------------
  // getCustomSourceUrls
  // ----------------------------------------------------------
  describe('getCustomSourceUrls', () => {
    it('should return custom URLs from config', () => {
      mockMarketplaceSources = ['https://github.com/org/repo'];
      const urls = service.getCustomSourceUrls();
      expect(urls).toEqual(['https://github.com/org/repo']);
    });

    it('should return empty array when no custom sources', () => {
      mockMarketplaceSources = [];
      const urls = service.getCustomSourceUrls();
      expect(urls).toEqual([]);
    });
  });

  // ----------------------------------------------------------
  // Builtin sources validation
  // ----------------------------------------------------------
  describe('BUILTIN_MARKETPLACE_SOURCES', () => {
    it('should have 3 builtin sources', () => {
      expect(BUILTIN_MARKETPLACE_SOURCES).toHaveLength(3);
    });

    it('should all be marked as builtin', () => {
      for (const src of BUILTIN_MARKETPLACE_SOURCES) {
        expect(src.isBuiltin).toBe(true);
      }
    });

    it('should have valid owner/repo for each', () => {
      for (const src of BUILTIN_MARKETPLACE_SOURCES) {
        expect(src.owner).toBeTruthy();
        expect(src.repo).toBeTruthy();
        expect(src.branch).toBe('main');
      }
    });
  });

  // ----------------------------------------------------------
  // Network operations (fetchSource, fetchAll)
  // ----------------------------------------------------------

  /**
   * Helper to mock https.get responses by URL.
   */
  function mockHttpResponses(
    map: Record<string, { status: number; body: string; headers?: Record<string, string> }>
  ) {
    vi.mocked(https.get as any).mockImplementation(
      (_url: string, _opts: unknown, cb: (res: any) => void) => {
        const entry = map[_url];
        const res = Object.assign(new EventEmitter(), {
          statusCode: entry?.status ?? 404,
          headers: entry?.headers ?? {},
          resume: vi.fn(),
        });
        const req = Object.assign(new EventEmitter(), { end: vi.fn() });

        process.nextTick(() => {
          cb(res);
          if (entry && entry.status >= 200 && entry.status < 300) {
            res.emit('data', Buffer.from(entry.body));
            res.emit('end');
          }
        });

        return req;
      }
    );
  }

  describe('fetchSource', () => {
    const testSource: MarketplaceSource = {
      id: 'testorg/skills',
      owner: 'testorg',
      repo: 'skills',
      branch: 'main',
      path: '',
      label: 'Test Org Skills',
      isBuiltin: false,
    };

    afterEach(() => {
      vi.mocked(https.get as any).mockReset();
    });

    it('should fetch and parse remote skills', async () => {
      mockHttpResponses({
        'https://api.github.com/repos/testorg/skills/git/trees/main?recursive=1': {
          status: 200,
          body: JSON.stringify({
            tree: [
              { type: 'tree', path: 'my-skill' },
              { type: 'blob', path: 'my-skill/SKILL.md' },
              { type: 'blob', path: 'README.md' },
            ],
          }),
        },
        'https://raw.githubusercontent.com/testorg/skills/main/my-skill/SKILL.md': {
          status: 200,
          body: '---\nname: My Skill\ndescription: A test skill\nauthor: tester\n---\n\n# My Skill\n\nContent here.',
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('my-skill');
      expect(skills[0].metadata.name).toBe('My Skill');
      expect(skills[0].metadata.description).toBe('A test skill');
      expect(skills[0].metadata.author).toBe('tester');
      expect(skills[0].source).toBe(testSource);
      expect(skills[0].repoPath).toBe('my-skill/SKILL.md');
    });

    it('should use cache on second call', async () => {
      mockHttpResponses({
        'https://api.github.com/repos/testorg/skills/git/trees/main?recursive=1': {
          status: 200,
          body: JSON.stringify({ tree: [{ type: 'blob', path: 'a/SKILL.md' }] }),
        },
        'https://raw.githubusercontent.com/testorg/skills/main/a/SKILL.md': {
          status: 200,
          body: '---\nname: A\ndescription: a\n---\nBody',
        },
      });

      const first = await service.fetchSource(testSource);
      expect(first).toHaveLength(1);

      vi.mocked(https.get as any).mockReset();

      const second = await service.fetchSource(testSource);
      expect(second).toHaveLength(1);
      expect(https.get).not.toHaveBeenCalled();
    });

    it('should bypass cache when force=true', async () => {
      mockHttpResponses({
        'https://api.github.com/repos/testorg/skills/git/trees/main?recursive=1': {
          status: 200,
          body: JSON.stringify({ tree: [{ type: 'blob', path: 'b/SKILL.md' }] }),
        },
        'https://raw.githubusercontent.com/testorg/skills/main/b/SKILL.md': {
          status: 200,
          body: '---\nname: B\ndescription: b\n---\nBody',
        },
      });

      await service.fetchSource(testSource);
      const results = await service.fetchSource(testSource, true);
      expect(results).toHaveLength(1);
      expect(https.get).toHaveBeenCalledTimes(4);
    });

    it('should filter by source path prefix', async () => {
      const pathSource: MarketplaceSource = {
        ...testSource,
        id: 'testorg/skills/sub',
        path: 'sub',
      };

      mockHttpResponses({
        'https://api.github.com/repos/testorg/skills/git/trees/main?recursive=1': {
          status: 200,
          body: JSON.stringify({
            tree: [
              { type: 'blob', path: 'sub/inside/SKILL.md' },
              { type: 'blob', path: 'outside/SKILL.md' },
            ],
          }),
        },
        'https://raw.githubusercontent.com/testorg/skills/main/sub/inside/SKILL.md': {
          status: 200,
          body: '---\nname: Inside\ndescription: in\n---\nBody',
        },
      });

      const skills = await service.fetchSource(pathSource);
      expect(skills).toHaveLength(1);
      expect(skills[0].metadata.name).toBe('Inside');
    });

    it('should handle empty tree response', async () => {
      mockHttpResponses({
        'https://api.github.com/repos/testorg/skills/git/trees/main?recursive=1': {
          status: 200,
          body: JSON.stringify({ tree: [] }),
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(0);
    });

    it('should handle missing tree property', async () => {
      mockHttpResponses({
        'https://api.github.com/repos/testorg/skills/git/trees/main?recursive=1': {
          status: 200,
          body: JSON.stringify({}),
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(0);
    });

    it('should reject on HTTP error', async () => {
      mockHttpResponses({
        'https://api.github.com/repos/testorg/skills/git/trees/main?recursive=1': {
          status: 404,
          body: 'Not Found',
        },
      });

      await expect(service.fetchSource(testSource)).rejects.toThrow('HTTP 404');
    });

    it('should reject on invalid JSON', async () => {
      mockHttpResponses({
        'https://api.github.com/repos/testorg/skills/git/trees/main?recursive=1': {
          status: 200,
          body: 'not json!!!',
        },
      });

      await expect(service.fetchSource(testSource)).rejects.toThrow();
    });

    it('should follow HTTP redirect', async () => {
      mockHttpResponses({
        'https://api.github.com/repos/testorg/skills/git/trees/main?recursive=1': {
          status: 301,
          body: '',
          headers: {
            location: 'https://api.github.com/repos/testorg/skills/git/trees/v2?recursive=1',
          },
        },
        'https://api.github.com/repos/testorg/skills/git/trees/v2?recursive=1': {
          status: 200,
          body: JSON.stringify({ tree: [{ type: 'blob', path: 'r/SKILL.md' }] }),
        },
        'https://raw.githubusercontent.com/testorg/skills/main/r/SKILL.md': {
          status: 200,
          body: '---\nname: Redirect\ndescription: redir\n---\nBody',
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(1);
      expect(skills[0].metadata.name).toBe('Redirect');
    });

    it('should return untitled when metadata has no name field', async () => {
      mockHttpResponses({
        'https://api.github.com/repos/testorg/skills/git/trees/main?recursive=1': {
          status: 200,
          body: JSON.stringify({ tree: [{ type: 'blob', path: 'my-cool-tool/SKILL.md' }] }),
        },
        'https://raw.githubusercontent.com/testorg/skills/main/my-cool-tool/SKILL.md': {
          status: 200,
          body: '---\ndescription: no name\n---\nBody',
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(1);
      // parseFrontmatter defaults to 'untitled' — _fetchSkillMd derive logic is unreachable
      expect(skills[0].metadata.name).toBe('untitled');
      expect(skills[0].id).toBe('my-cool-tool');
    });

    it('should handle network error', async () => {
      vi.mocked(https.get as any).mockImplementation(
        (_url: string, _opts: unknown, _cb: (...args: any[]) => void) => {
          const req = Object.assign(new EventEmitter(), { end: vi.fn() });
          process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
          return req;
        }
      );

      await expect(service.fetchSource(testSource)).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('fetchAll', () => {
    afterEach(() => {
      vi.mocked(https.get as any).mockReset();
    });

    it('should aggregate skills from all sources', async () => {
      mockHttpResponses({
        'https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1': {
          status: 200,
          body: JSON.stringify({ tree: [{ type: 'blob', path: 'alpha/SKILL.md' }] }),
        },
        'https://raw.githubusercontent.com/anthropics/skills/main/alpha/SKILL.md': {
          status: 200,
          body: '---\nname: Alpha\ndescription: a\n---\nBody',
        },
      });

      const skills = await service.fetchAll();
      expect(skills.length).toBeGreaterThanOrEqual(1);
      expect(skills.find(s => s.metadata.name === 'Alpha')).toBeDefined();
    });

    it('should return empty array when all sources fail', async () => {
      mockHttpResponses({});

      const skills = await service.fetchAll();
      expect(skills).toEqual([]);
    });

    it('should force refresh all sources', async () => {
      mockHttpResponses({
        'https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1': {
          status: 200,
          body: JSON.stringify({ tree: [{ type: 'blob', path: 'a/SKILL.md' }] }),
        },
        'https://raw.githubusercontent.com/anthropics/skills/main/a/SKILL.md': {
          status: 200,
          body: '---\nname: A\ndescription: a\n---\nBody',
        },
      });

      await service.fetchAll();
      const result = await service.fetchAll(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });
});
