import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import { EventEmitter } from 'events';

/**
 * Build a minimal tar.gz buffer from a map of {path: content}.
 * Mimics the GitHub codeload archive format where all entries are
 * nested under a root directory (e.g. "repo-main/").
 */
function buildTarGz(files: Record<string, string>, rootPrefix = 'repo-main'): Buffer {
  const blocks: Buffer[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = `${rootPrefix}/${filePath}`;
    const contentBuf = Buffer.from(content, 'utf-8');

    // 512-byte tar header
    const header = Buffer.alloc(512);
    header.write(fullPath.substring(0, 100), 0, 'utf-8');       // name
    header.write('0000644\0', 100, 'utf-8');                     // mode
    header.write('0000000\0', 108, 'utf-8');                     // uid
    header.write('0000000\0', 116, 'utf-8');                     // gid
    header.write(contentBuf.length.toString(8).padStart(11, '0') + '\0', 124, 'utf-8'); // size
    header.write('00000000000\0', 136, 'utf-8');                 // mtime
    header.fill(0x20, 148, 156);                                 // checksum placeholder
    header[156] = 0x30;                                          // type '0' = regular file

    // Calculate and write checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) { checksum += header[i]; }
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf-8');

    blocks.push(header);

    // Content padded to 512-byte boundary
    const padded = Buffer.alloc(Math.ceil(contentBuf.length / 512) * 512);
    contentBuf.copy(padded);
    blocks.push(padded);
  }

  // End-of-archive marker: two 512-byte zero blocks
  blocks.push(Buffer.alloc(1024));

  return zlib.gzipSync(Buffer.concat(blocks));
}

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
  // makeSkillId
  // ----------------------------------------------------------
  describe('makeSkillId', () => {
    it('should create a namespaced ID from source and dirName', () => {
      const source: MarketplaceSource = {
        id: 'anthropics/skills', owner: 'anthropics', repo: 'skills',
        branch: 'main', path: '', label: 'Anthropic', isBuiltin: true,
      };
      expect(MarketplaceService.makeSkillId(source, 'code-review')).toBe('anthropics--skills--code-review');
    });

    it('should include source path in ID when present', () => {
      const source: MarketplaceSource = {
        id: 'github/awesome-copilot/skills', owner: 'github', repo: 'awesome-copilot',
        branch: 'main', path: 'skills', label: 'GitHub', isBuiltin: true,
      };
      expect(MarketplaceService.makeSkillId(source, 'my-skill')).toBe('github--awesome-copilot--skills--my-skill');
    });

    it('should handle nested sub-path with slashes', () => {
      const source: MarketplaceSource = {
        id: 'org/repo/a/b', owner: 'org', repo: 'repo',
        branch: 'main', path: 'a/b', label: 'Org', isBuiltin: false,
      };
      expect(MarketplaceService.makeSkillId(source, 'tool')).toBe('org--repo--a--b--tool');
    });

    it('should produce different IDs for same dirName from different sources', () => {
      const srcA: MarketplaceSource = {
        id: 'anthropics/skills', owner: 'anthropics', repo: 'skills',
        branch: 'main', path: '', label: 'A', isBuiltin: true,
      };
      const srcB: MarketplaceSource = {
        id: 'openai/skills', owner: 'openai', repo: 'skills',
        branch: 'main', path: '', label: 'B', isBuiltin: true,
      };
      const idA = MarketplaceService.makeSkillId(srcA, 'code-review');
      const idB = MarketplaceService.makeSkillId(srcB, 'code-review');
      expect(idA).not.toBe(idB);
      expect(idA).toBe('anthropics--skills--code-review');
      expect(idB).toBe('openai--skills--code-review');
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
  // fetchFileContent
  // ----------------------------------------------------------
  describe('fetchFileContent', () => {
    afterEach(() => {
      vi.mocked(https.get as any).mockReset();
    });

    it('should fetch the raw content of a remote file', async () => {
      const fileUrl = 'https://raw.githubusercontent.com/org/repo/main/skill/reference.md';
      vi.mocked(https.get as any).mockImplementation(
        (_url: string, _opts: unknown, cb: (res: any) => void) => {
          const res = Object.assign(new EventEmitter(), {
            statusCode: 200, headers: {}, resume: vi.fn(),
          });
          const req = Object.assign(new EventEmitter(), { end: vi.fn() });
          process.nextTick(() => {
            cb(res);
            res.emit('data', Buffer.from('# Reference\n\nDoc content'));
            res.emit('end');
          });
          return req;
        }
      );

      const content = await service.fetchFileContent(fileUrl);
      expect(content).toBe('# Reference\n\nDoc content');
    });

    it('should reject on HTTP error', async () => {
      const fileUrl = 'https://raw.githubusercontent.com/org/repo/main/skill/missing.md';
      vi.mocked(https.get as any).mockImplementation(
        (_url: string, _opts: unknown, cb: (res: any) => void) => {
          const res = Object.assign(new EventEmitter(), {
            statusCode: 404, headers: {}, resume: vi.fn(),
          });
          const req = Object.assign(new EventEmitter(), { end: vi.fn() });
          process.nextTick(() => {
            cb(res);
          });
          return req;
        }
      );

      await expect(service.fetchFileContent(fileUrl)).rejects.toThrow('HTTP 404');
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

    it('should download and write additional files when installing', async () => {
      const refUrl = 'https://raw.githubusercontent.com/anthropics/skills/main/rich-skill/reference.md';
      const scriptUrl = 'https://raw.githubusercontent.com/anthropics/skills/main/rich-skill/scripts/helper.sh';

      vi.mocked(https.get as any).mockImplementation(
        (_url: string, _opts: unknown, cb: (res: any) => void) => {
          const bodies: Record<string, string> = {
            [refUrl]: '# Reference\n\nDocs here',
            [scriptUrl]: '#!/bin/bash\necho hello',
          };
          const res = Object.assign(new EventEmitter(), {
            statusCode: 200, headers: {}, resume: vi.fn(),
          });
          const req = Object.assign(new EventEmitter(), { end: vi.fn() });
          process.nextTick(() => {
            cb(res);
            res.emit('data', Buffer.from(bodies[_url] ?? ''));
            res.emit('end');
          });
          return req;
        }
      );

      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'rich-skill',
        metadata: { name: 'Rich Skill', description: 'Has extras' },
        body: '# Rich',
        repoPath: 'skills/rich-skill/SKILL.md',
        downloadUrl: 'https://...',
        additionalFiles: [
          { relativePath: 'reference.md', downloadUrl: refUrl },
          { relativePath: 'scripts/helper.sh', downloadUrl: scriptUrl },
        ],
      };

      await service.installSkill(remote);

      // SKILL.md was created
      const skill = await storageService.readSkill('rich-skill');
      expect(skill).not.toBeNull();

      // Additional files were written
      const fs2 = await import('fs');
      const refPath = path.join(tmpDir, 'rich-skill', 'reference.md');
      const helperPath = path.join(tmpDir, 'rich-skill', 'scripts', 'helper.sh');
      expect(fs2.existsSync(refPath)).toBe(true);
      expect(fs2.readFileSync(refPath, 'utf-8')).toBe('# Reference\n\nDocs here');
      expect(fs2.existsSync(helperPath)).toBe(true);
      expect(fs2.readFileSync(helperPath, 'utf-8')).toBe('#!/bin/bash\necho hello');
    });
  });

  // ----------------------------------------------------------
  // recordInstall called by installSkill
  // ----------------------------------------------------------
  describe('installSkill stats integration', () => {
    it('should record install stats after installing a new skill', async () => {
      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'stats-skill',
        metadata: { name: 'Stats Skill', description: 'Has stats', version: '1.2.3' },
        body: '# Stats',
        repoPath: 'skills/stats-skill/SKILL.md',
        downloadUrl: 'https://...',
      };

      await service.installSkill(remote);

      const versions = await service.getInstalledVersionMap();
      expect(versions.get('stats-skill')).toBe('1.2.3');
    });

    it('should record install stats when overwriting an existing skill', async () => {
      const skillDir = path.join(tmpDir, 'overwrite-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: Old\ndescription: Old desc\n---\n'
      );

      const vscodeModule = await import('vscode');
      vi.mocked(vscodeModule.window.showWarningMessage).mockResolvedValue('Overwrite' as any);

      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'overwrite-skill',
        metadata: { name: 'New', description: 'New desc', version: '2.0.0' },
        body: '# New',
        repoPath: 'skills/overwrite-skill/SKILL.md',
        downloadUrl: 'https://...',
      };

      await service.installSkill(remote);

      const versions = await service.getInstalledVersionMap();
      expect(versions.get('overwrite-skill')).toBe('2.0.0');
    });

    it('should not record stats when user cancels overwrite', async () => {
      const skillDir = path.join(tmpDir, 'no-overwrite');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: Keep\ndescription: Keep\n---\n'
      );

      const vscodeModule = await import('vscode');
      vi.mocked(vscodeModule.window.showWarningMessage).mockResolvedValue('Cancel' as any);

      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'no-overwrite',
        metadata: { name: 'New', description: 'New', version: '3.0.0' },
        body: '# New',
        repoPath: 'skills/no-overwrite/SKILL.md',
        downloadUrl: 'https://...',
      };

      await service.installSkill(remote);

      const versions = await service.getInstalledVersionMap();
      expect(versions.has('no-overwrite')).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // getInstalledVersionMap
  // ----------------------------------------------------------
  describe('getInstalledVersionMap', () => {
    it('should return empty map when no skills have been installed via marketplace', async () => {
      const map = await service.getInstalledVersionMap();
      expect(map.size).toBe(0);
    });

    it('should return installed versions after installs', async () => {
      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'ver-skill',
        metadata: { name: 'Ver', description: '', version: '0.5.0' },
        body: '',
        repoPath: 'skills/ver-skill/SKILL.md',
        downloadUrl: 'https://...',
      };

      await service.installSkill(remote);

      const map = await service.getInstalledVersionMap();
      expect(map.get('ver-skill')).toBe('0.5.0');
    });
  });

  // ----------------------------------------------------------
  // updateSkillSilently
  // ----------------------------------------------------------
  describe('updateSkillSilently', () => {
    it('should update the skill and record install without showing a dialog', async () => {
      await storageService.createSkill('silent-skill', { name: 'Old', description: 'v1' }, '# Old');

      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'silent-skill',
        metadata: { name: 'New', description: 'v2', version: '2.0.0' },
        body: '# New',
        repoPath: 'skills/silent-skill/SKILL.md',
        downloadUrl: 'https://...',
      };

      const vscodeModule = await import('vscode');
      vi.mocked(vscodeModule.window.showWarningMessage).mockClear();
      await service.updateSkillSilently(remote);

      // Skill content updated
      const skill = await storageService.readSkill('silent-skill');
      expect(skill!.metadata.name).toBe('New');
      expect(skill!.metadata.description).toBe('v2');

      // Stats recorded
      const versions = await service.getInstalledVersionMap();
      expect(versions.get('silent-skill')).toBe('2.0.0');

      // No warning dialog shown
      expect(vscodeModule.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('should download and write additional files when updating silently', async () => {
      await storageService.createSkill('update-files-skill', { name: 'Old', description: '' }, '# Old');

      const refUrl = 'https://raw.githubusercontent.com/anthropics/skills/main/update-files-skill/ref.md';
      vi.mocked(https.get as any).mockImplementation(
        (_url: string, _opts: unknown, cb: (res: any) => void) => {
          const res = Object.assign(new EventEmitter(), {
            statusCode: 200, headers: {}, resume: vi.fn(),
          });
          const req = Object.assign(new EventEmitter(), { end: vi.fn() });
          process.nextTick(() => {
            cb(res);
            res.emit('data', Buffer.from('# Updated Reference'));
            res.emit('end');
          });
          return req;
        }
      );

      const remote = {
        source: BUILTIN_MARKETPLACE_SOURCES[0],
        id: 'update-files-skill',
        metadata: { name: 'New', description: 'v2', version: '2.0.0' },
        body: '# New',
        repoPath: 'skills/update-files-skill/SKILL.md',
        downloadUrl: 'https://...',
        additionalFiles: [{ relativePath: 'ref.md', downloadUrl: refUrl }],
      };

      await service.updateSkillSilently(remote);

      const fs2 = await import('fs');
      const refPath = path.join(tmpDir, 'update-files-skill', 'ref.md');
      expect(fs2.existsSync(refPath)).toBe(true);
      expect(fs2.readFileSync(refPath, 'utf-8')).toBe('# Updated Reference');
    });
  });

  // ----------------------------------------------------------
  // Token resolution (getToken callback)
  // ----------------------------------------------------------
  describe('getToken callback', () => {
    afterEach(() => {
      vi.mocked(https.get as any).mockReset();
    });

    it('should use the token from getToken callback in request headers', async () => {
      const mockGetToken = vi.fn().mockResolvedValue('secret-token-abc');
      const serviceWithToken = new MarketplaceService(storageService, mockGetToken);

      let capturedHeaders: Record<string, string> = {};
      vi.mocked(https.get as any).mockImplementation(
        (_url: string, opts: { headers: Record<string, string> }, cb: (res: any) => void) => {
          capturedHeaders = opts.headers;
          const res = Object.assign(new EventEmitter(), {
            statusCode: 200, headers: {}, resume: vi.fn(),
          });
          const req = Object.assign(new EventEmitter(), { end: vi.fn() });
          process.nextTick(() => {
            cb(res);
            res.emit('data', buildTarGz({}));
            res.emit('end');
          });
          return req;
        }
      );

      const testSource: MarketplaceSource = {
        id: 'tok/test', owner: 'tok', repo: 'test', branch: 'main', path: '', label: 'Tok', isBuiltin: false,
      };

      await serviceWithToken.fetchSource(testSource);

      expect(mockGetToken).toHaveBeenCalled();
      expect(capturedHeaders['Authorization']).toBe('token secret-token-abc');
    });

    it('should send no Authorization header when getToken returns undefined', async () => {
      const mockGetToken = vi.fn().mockResolvedValue(undefined);
      const serviceNoToken = new MarketplaceService(storageService, mockGetToken);

      let capturedHeaders: Record<string, string> = {};
      vi.mocked(https.get as any).mockImplementation(
        (_url: string, opts: { headers: Record<string, string> }, cb: (res: any) => void) => {
          capturedHeaders = opts.headers;
          const res = Object.assign(new EventEmitter(), {
            statusCode: 200, headers: {}, resume: vi.fn(),
          });
          const req = Object.assign(new EventEmitter(), { end: vi.fn() });
          process.nextTick(() => {
            cb(res);
            res.emit('data', buildTarGz({}));
            res.emit('end');
          });
          return req;
        }
      );

      const testSource: MarketplaceSource = {
        id: 'no/tok', owner: 'no', repo: 'tok', branch: 'main', path: '', label: 'No', isBuiltin: false,
      };

      await serviceNoToken.fetchSource(testSource);

      expect(capturedHeaders['Authorization']).toBeUndefined();
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
    map: Record<string, { status: number; body: string | Buffer; headers?: Record<string, string> }>
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
            const bodyBuf = Buffer.isBuffer(entry.body) ? entry.body : Buffer.from(entry.body);
            res.emit('data', bodyBuf);
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
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'my-skill/SKILL.md': '---\nname: My Skill\ndescription: A test skill\nauthor: tester\n---\n\n# My Skill\n\nContent here.',
            'README.md': '# Readme',
          }),
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('testorg--skills--my-skill');
      expect(skills[0].metadata.name).toBe('My Skill');
      expect(skills[0].metadata.description).toBe('A test skill');
      expect(skills[0].metadata.author).toBe('tester');
      expect(skills[0].source).toBe(testSource);
      expect(skills[0].repoPath).toBe('my-skill/SKILL.md');
    });

    it('should use cache on second call', async () => {
      mockHttpResponses({
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'a/SKILL.md': '---\nname: A\ndescription: a\n---\nBody',
          }),
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
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'b/SKILL.md': '---\nname: B\ndescription: b\n---\nBody',
          }),
        },
      });

      await service.fetchSource(testSource);
      const results = await service.fetchSource(testSource, true);
      expect(results).toHaveLength(1);
      // 1 HTTP call per fetch (archive download), 2 fetches total
      expect(https.get).toHaveBeenCalledTimes(2);
    });

    it('should filter by source path prefix', async () => {
      const pathSource: MarketplaceSource = {
        ...testSource,
        id: 'testorg/skills/sub',
        path: 'sub',
      };

      mockHttpResponses({
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'sub/inside/SKILL.md': '---\nname: Inside\ndescription: in\n---\nBody',
            'outside/SKILL.md': '---\nname: Outside\ndescription: out\n---\nBody',
          }),
        },
      });

      const skills = await service.fetchSource(pathSource);
      expect(skills).toHaveLength(1);
      expect(skills[0].metadata.name).toBe('Inside');
    });

    it('should handle archive with no SKILL.md files', async () => {
      mockHttpResponses({
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'README.md': '# No skills here',
          }),
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(0);
    });

    it('should handle empty archive', async () => {
      mockHttpResponses({
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({}),
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(0);
    });

    it('should reject on HTTP error', async () => {
      mockHttpResponses({
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 404,
          body: 'Not Found',
        },
      });

      await expect(service.fetchSource(testSource)).rejects.toThrow('HTTP 404');
    });

    it('should reject on invalid archive', async () => {
      mockHttpResponses({
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: Buffer.from('not a valid gzip stream'),
        },
      });

      await expect(service.fetchSource(testSource)).rejects.toThrow();
    });

    it('should follow HTTP redirect', async () => {
      mockHttpResponses({
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 301,
          body: '',
          headers: {
            location: 'https://codeload.github.com/testorg/skills/tar.gz/some-redirect',
          },
        },
        'https://codeload.github.com/testorg/skills/tar.gz/some-redirect': {
          status: 200,
          body: buildTarGz({
            'r/SKILL.md': '---\nname: Redirect\ndescription: redir\n---\nBody',
          }),
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(1);
      expect(skills[0].metadata.name).toBe('Redirect');
    });

    it('should return untitled when metadata has no name field', async () => {
      mockHttpResponses({
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'my-cool-tool/SKILL.md': '---\ndescription: no name\n---\nBody',
          }),
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(1);
      expect(skills[0].metadata.name).toBe('untitled');
      expect(skills[0].id).toBe('testorg--skills--my-cool-tool');
    });

    it('should populate additionalFiles for sibling files in the skill directory', async () => {
      mockHttpResponses({
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'my-skill/SKILL.md': '---\nname: My Skill\ndescription: desc\n---\nContent',
            'my-skill/reference.md': '# Reference\n\nDocs here',
            'my-skill/scripts/helper.sh': '#!/bin/bash\necho hello',
            'README.md': '# Root readme',
          }),
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(1);
      expect(skills[0].additionalFiles).toHaveLength(2);

      const paths = skills[0].additionalFiles!.map((f) => f.relativePath);
      expect(paths).toContain('reference.md');
      expect(paths).toContain('scripts/helper.sh');

      const ref = skills[0].additionalFiles!.find((f) => f.relativePath === 'reference.md')!;
      expect(ref.downloadUrl).toBe(
        'https://raw.githubusercontent.com/testorg/skills/main/my-skill/reference.md'
      );
    });

    it('should set additionalFiles to undefined when there are no siblings', async () => {
      mockHttpResponses({
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'solo-skill/SKILL.md': '---\nname: Solo\ndescription: alone\n---\nBody',
            'README.md': '# Root',
          }),
        },
      });

      const skills = await service.fetchSource(testSource);
      expect(skills).toHaveLength(1);
      expect(skills[0].additionalFiles).toBeUndefined();
    });

    it('should namespace skill IDs by source to avoid collisions across repos', async () => {
      const sourceA: MarketplaceSource = {
        id: 'orgA/skills', owner: 'orgA', repo: 'skills',
        branch: 'main', path: '', label: 'Org A', isBuiltin: false,
      };
      const sourceB: MarketplaceSource = {
        id: 'orgB/skills', owner: 'orgB', repo: 'skills',
        branch: 'main', path: '', label: 'Org B', isBuiltin: false,
      };

      mockHttpResponses({
        'https://codeload.github.com/orgA/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'code-review/SKILL.md': '---\nname: Code Review\ndescription: from A\n---\nBody A',
          }),
        },
      });
      const skillsA = await service.fetchSource(sourceA);

      vi.mocked(https.get as any).mockReset();

      mockHttpResponses({
        'https://codeload.github.com/orgB/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'code-review/SKILL.md': '---\nname: Code Review\ndescription: from B\n---\nBody B',
          }),
        },
      });
      const skillsB = await service.fetchSource(sourceB);

      expect(skillsA).toHaveLength(1);
      expect(skillsB).toHaveLength(1);
      expect(skillsA[0].id).toBe('orgA--skills--code-review');
      expect(skillsB[0].id).toBe('orgB--skills--code-review');
      expect(skillsA[0].id).not.toBe(skillsB[0].id);
    });

    it('should namespace skill IDs including sub-path for sources with path', async () => {
      const pathSource: MarketplaceSource = {
        ...testSource,
        id: 'testorg/skills/sub',
        path: 'sub',
      };

      mockHttpResponses({
        'https://codeload.github.com/testorg/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'sub/inside/SKILL.md': '---\nname: Inside\ndescription: in\n---\nBody',
          }),
        },
      });

      const skills = await service.fetchSource(pathSource);
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('testorg--skills--sub--inside');
    });

    it('should install skills from different sources without collision', async () => {
      // Install a skill from sourceA
      const remoteA = {
        source: { id: 'orgA/skills', owner: 'orgA', repo: 'skills', branch: 'main', path: '', label: 'A', isBuiltin: false } as MarketplaceSource,
        id: 'orgA--skills--my-skill',
        metadata: { name: 'My Skill', description: 'from A', version: '1.0' },
        body: '# A version',
        repoPath: 'my-skill/SKILL.md',
        downloadUrl: 'https://...',
      };

      const remoteB = {
        source: { id: 'orgB/skills', owner: 'orgB', repo: 'skills', branch: 'main', path: '', label: 'B', isBuiltin: false } as MarketplaceSource,
        id: 'orgB--skills--my-skill',
        metadata: { name: 'My Skill', description: 'from B', version: '2.0' },
        body: '# B version',
        repoPath: 'my-skill/SKILL.md',
        downloadUrl: 'https://...',
      };

      await service.installSkill(remoteA);
      await service.installSkill(remoteB);

      // Both should exist independently
      const skillA = await storageService.readSkill('orgA--skills--my-skill');
      const skillB = await storageService.readSkill('orgB--skills--my-skill');
      expect(skillA).not.toBeNull();
      expect(skillB).not.toBeNull();
      expect(skillA!.metadata.description).toBe('from A');
      expect(skillB!.metadata.description).toBe('from B');
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
        'https://codeload.github.com/anthropics/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'alpha/SKILL.md': '---\nname: Alpha\ndescription: a\n---\nBody',
          }),
        },
      });

      const skills = await service.fetchAll();
      expect(skills.length).toBeGreaterThanOrEqual(1);
      expect(skills.find(s => s.metadata.name === 'Alpha')).toBeDefined();
    });

    it('should throw when all sources fail', async () => {
      mockHttpResponses({});

      await expect(service.fetchAll()).rejects.toThrow(/failed to load/i);
    });

    it('should force refresh all sources', async () => {
      mockHttpResponses({
        'https://codeload.github.com/anthropics/skills/tar.gz/refs/heads/main': {
          status: 200,
          body: buildTarGz({
            'a/SKILL.md': '---\nname: A\ndescription: a\n---\nBody',
          }),
        },
      });

      await service.fetchAll();
      const result = await service.fetchAll(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });
});
