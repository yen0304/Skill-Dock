import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillLibraryProvider, SkillTreeItem } from './skillLibraryProvider';
import { StorageService } from '../services/storageService';
import { ImportExportService } from '../services/importExportService';
import { Skill } from '../models/skill';
import { TreeItemCollapsibleState, DataTransfer, DataTransferItem, window as vscodeWindow } from 'vscode';

// Point libraryPath to our temp dir
let mockLibraryPath = '';
vi.mock('vscode', async () => {
  const actual = await vi.importActual<typeof import('vscode')>('vscode');
  return {
    ...actual,
    workspace: {
      ...actual.workspace,
      getConfiguration: vi.fn(() => ({
        get: (key: string, def?: unknown) => {
          if (key === 'libraryPath') { return mockLibraryPath; }
          return def;
        },
      })),
    },
  };
});

describe('SkillTreeItem', () => {
  const sampleSkill: Skill = {
    id: 'test-skill',
    metadata: {
      name: 'Test Skill',
      description: 'A fantastic test skill for unit testing purposes',
      author: 'Tester',
      version: '1.0',
      tags: ['test', 'utils'],
    },
    body: '# Test\nHello world',
    dirPath: '/tmp/skills/test-skill',
    filePath: '/tmp/skills/test-skill/SKILL.md',
    lastModified: Date.now(),
  };

  it('should create tree item with skill name as label', () => {
    const item = new SkillTreeItem(sampleSkill, 'library');
    expect(item.label).toBe('Test Skill');
  });

  it('should have TreeItemCollapsibleState.None', () => {
    const item = new SkillTreeItem(sampleSkill, 'library');
    expect(item.collapsibleState).toBe(TreeItemCollapsibleState.None);
  });

  it('should have tooltip with metadata', () => {
    const item = new SkillTreeItem(sampleSkill, 'library');
    const tooltip = item.tooltip!.toString();
    expect(tooltip).toContain('Test Skill');
    expect(tooltip).toContain('Tester');
    expect(tooltip).toContain('1.0');
    expect(tooltip).toContain('test, utils');
  });

  it('should truncate long descriptions', () => {
    const longDesc = 'A'.repeat(100);
    const skill = { ...sampleSkill, metadata: { ...sampleSkill.metadata, description: longDesc } };
    const item = new SkillTreeItem(skill, 'library');
    expect(item.description!.length).toBeLessThanOrEqual(60);
    expect(item.description!.endsWith('...')).toBe(true);
  });

  it('should not truncate short descriptions', () => {
    const skill = { ...sampleSkill, metadata: { ...sampleSkill.metadata, description: 'Short' } };
    const item = new SkillTreeItem(skill, 'library');
    expect(item.description).toBe('Short');
  });

  it('should set contextValue to skill', () => {
    const item = new SkillTreeItem(sampleSkill, 'library');
    expect(item.contextValue).toBe('skill');
  });

  it('should use symbol-method icon', () => {
    const item = new SkillTreeItem(sampleSkill, 'library');
    expect((item.iconPath as any).id).toBe('symbol-method');
  });

  it('should have viewSkill command', () => {
    const item = new SkillTreeItem(sampleSkill, 'library');
    expect(item.command).toBeDefined();
    expect((item.command as any).command).toBe('skilldock.viewSkill');
  });

  it('should store skill reference', () => {
    const item = new SkillTreeItem(sampleSkill, 'library');
    expect(item.skill).toBe(sampleSkill);
  });

  it('should store source type', () => {
    const item = new SkillTreeItem(sampleSkill, 'repo');
    expect(item.source).toBe('repo');
  });

  it('should handle skill without optional metadata', () => {
    const minimalSkill: Skill = {
      id: 'min',
      metadata: { name: 'Min', description: 'Minimal' },
      body: '',
      dirPath: '/tmp/min',
      filePath: '/tmp/min/SKILL.md',
      lastModified: 0,
    };
    const item = new SkillTreeItem(minimalSkill, 'library');
    expect(item.tooltip).toBeDefined();
    // No author/version/tags lines in tooltip
    const tooltip = item.tooltip!.toString();
    expect(tooltip).toContain('Min');
    expect(tooltip).not.toContain('Author');
  });
});

describe('SkillLibraryProvider', () => {
  let tmpDir: string;
  let storageService: StorageService;
  let provider: SkillLibraryProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-test-'));
    mockLibraryPath = tmpDir;
    storageService = new StorageService();
    provider = new SkillLibraryProvider(storageService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should fire onDidChangeTreeData when refresh is called', () => {
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.refresh();
    expect(listener).toHaveBeenCalled();
  });

  it('should return empty list when library is empty', async () => {
    const children = await provider.getChildren();
    expect(children).toEqual([]);
  });

  it('should return SkillTreeItems for library skills', async () => {
    // Create a skill in the library
    const skillDir = path.join(tmpDir, 'my-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: My Skill\ndescription: Desc\n---\nBody'
    );

    const children = await provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(SkillTreeItem);
    expect(children[0].skill.metadata.name).toBe('My Skill');
    expect(children[0].source).toBe('library');
  });

  it('should filter skills when setFilter is called', async () => {
    // Create two skills
    for (const name of ['alpha-skill', 'beta-skill']) {
      const skillDir = path.join(tmpDir, name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: A ${name}\n---\nBody`
      );
    }

    // No filter
    let children = await provider.getChildren();
    expect(children).toHaveLength(2);

    // Set filter
    provider.setFilter('alpha');
    children = await provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].skill.id).toBe('alpha-skill');

    // Clear filter
    provider.setFilter('');
    children = await provider.getChildren();
    expect(children).toHaveLength(2);
  });

  it('should return element from getTreeItem', () => {
    const skill: Skill = {
      id: 'x',
      metadata: { name: 'X', description: 'x' },
      body: '',
      dirPath: '/tmp/x',
      filePath: '/tmp/x/SKILL.md',
      lastModified: 0,
    };
    const item = new SkillTreeItem(skill, 'library');
    expect(provider.getTreeItem(item)).toBe(item);
  });

  it('should have correct MIME types for drag and drop', () => {
    expect(provider.dropMimeTypes).toContain('application/vnd.code.tree.skilldock.reposkills');
    expect(provider.dragMimeTypes).toEqual([]);
  });

  it('should accept setImportExportService', () => {
    const mockImportExport = {} as ImportExportService;
    expect(() => provider.setImportExportService(mockImportExport)).not.toThrow();
  });

  it('handleDrag should be a no-op', () => {
    expect(() => (provider as any).handleDrag()).not.toThrow();
  });

  it('should handle handleDrop with valid data', async () => {
    // Set up importExportService
    const importService = {
      exportToLibrary: vi.fn().mockResolvedValue({
        id: 'dropped-skill',
        metadata: { name: 'Dropped', description: '' },
        body: '',
        dirPath: '/tmp/dropped',
        filePath: '/tmp/dropped/SKILL.md',
        lastModified: 0,
      }),
    } as unknown as ImportExportService;
    provider.setImportExportService(importService);

    const payload = JSON.stringify([{
      id: 'dropped-skill',
      dirPath: '/tmp/dropped',
      filePath: '/tmp/dropped/SKILL.md',
      name: 'Dropped',
    }]);

    const dataTransfer = new DataTransfer();
    dataTransfer.set(
      'application/vnd.code.tree.skilldock.reposkills',
      new DataTransferItem(payload)
    );

    await provider.handleDrop(undefined, dataTransfer);
    expect(importService.exportToLibrary).toHaveBeenCalled();
  });

  it('should handle handleDrop with no import service', async () => {
    const dataTransfer = new DataTransfer();
    dataTransfer.set(
      'application/vnd.code.tree.skilldock.reposkills',
      new DataTransferItem('[]')
    );

    // No importExportService set - should not throw
    await provider.handleDrop(undefined, dataTransfer);
  });

  it('should handle handleDrop with no data', async () => {
    const importService = { exportToLibrary: vi.fn() } as unknown as ImportExportService;
    provider.setImportExportService(importService);

    const dataTransfer = new DataTransfer();
    await provider.handleDrop(undefined, dataTransfer);
    expect(importService.exportToLibrary).not.toHaveBeenCalled();
  });

  it('should handle handleDrop with duplicate skill (overwrite)', async () => {
    // Create existing skill in library
    const skillDir = path.join(tmpDir, 'dup-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: Dup Skill\ndescription: Existing\n---\nBody'
    );

    const importService = {
      exportToLibrary: vi.fn().mockResolvedValue({
        id: 'dup-skill',
        metadata: { name: 'Dup Skill', description: '' },
        body: '',
        dirPath: tmpDir + '/dup-skill',
        filePath: tmpDir + '/dup-skill/SKILL.md',
        lastModified: 0,
      }),
    } as unknown as ImportExportService;
    provider.setImportExportService(importService);

    // Mock user choosing "Overwrite"
    vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Overwrite' as any);

    const payload = JSON.stringify([{
      id: 'dup-skill',
      dirPath: '/tmp/new-dup',
      filePath: '/tmp/new-dup/SKILL.md',
      name: 'Dup Skill',
    }]);

    const dataTransfer = new DataTransfer();
    dataTransfer.set(
      'application/vnd.code.tree.skilldock.reposkills',
      new DataTransferItem(payload)
    );

    await provider.handleDrop(undefined, dataTransfer);
    expect(importService.exportToLibrary).toHaveBeenCalled();
  });

  it('should handle handleDrop with duplicate skill (skip)', async () => {
    const skillDir = path.join(tmpDir, 'skip-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: Skip Skill\ndescription: Existing\n---\nBody'
    );

    const importService = {
      exportToLibrary: vi.fn(),
    } as unknown as ImportExportService;
    provider.setImportExportService(importService);

    // Mock user choosing "Skip"
    vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Skip' as any);

    const payload = JSON.stringify([{
      id: 'skip-skill',
      dirPath: '/tmp/skip',
      filePath: '/tmp/skip/SKILL.md',
      name: 'Skip Skill',
    }]);

    const dataTransfer = new DataTransfer();
    dataTransfer.set(
      'application/vnd.code.tree.skilldock.reposkills',
      new DataTransferItem(payload)
    );

    await provider.handleDrop(undefined, dataTransfer);
    expect(importService.exportToLibrary).not.toHaveBeenCalled();
  });

  it('should handle handleDrop with duplicate skill (keep both)', async () => {
    // Create existing skill in library
    const skillDir = path.join(tmpDir, 'dup-keep-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: Dup Keep Skill\ndescription: Existing\n---\nBody'
    );

    const importService = {
      exportToLibrary: vi.fn().mockResolvedValue({
        id: 'dup-keep-skill',
        metadata: { name: 'Dup Keep Skill', description: '' },
        body: '',
        dirPath: tmpDir + '/dup-keep-skill',
        filePath: tmpDir + '/dup-keep-skill/SKILL.md',
        lastModified: 0,
      }),
    } as unknown as ImportExportService;
    provider.setImportExportService(importService);

    // Mock user choosing "Keep Both"
    vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Keep Both' as any);

    const payload = JSON.stringify([{
      id: 'dup-keep-skill',
      dirPath: '/tmp/new-dup-keep',
      filePath: '/tmp/new-dup-keep/SKILL.md',
      name: 'Dup Keep Skill',
    }]);

    const dataTransfer = new DataTransfer();
    dataTransfer.set(
      'application/vnd.code.tree.skilldock.reposkills',
      new DataTransferItem(payload)
    );

    await provider.handleDrop(undefined, dataTransfer);
    // Keep Both falls through to exportToLibrary without deleting
    expect(importService.exportToLibrary).toHaveBeenCalled();
  });

  it('should silently skip item when exportToLibrary throws', async () => {
    const importService = {
      exportToLibrary: vi.fn().mockRejectedValue(new Error('write error')),
    } as unknown as ImportExportService;
    provider.setImportExportService(importService);

    const payload = JSON.stringify([{
      id: 'error-skill',
      dirPath: '/tmp/error-skill',
      filePath: '/tmp/error-skill/SKILL.md',
      name: 'Error Skill',
    }]);

    const dataTransfer = new DataTransfer();
    dataTransfer.set(
      'application/vnd.code.tree.skilldock.reposkills',
      new DataTransferItem(payload)
    );

    // Should not throw even when exportToLibrary rejects
    await expect(provider.handleDrop(undefined, dataTransfer)).resolves.not.toThrow();
    // savedCount stays 0, so no info message shown
    expect(vscodeWindow.showInformationMessage).not.toHaveBeenCalled();
  });

  it('should handle handleDrop with invalid JSON', async () => {
    const importService = {
      exportToLibrary: vi.fn(),
    } as unknown as ImportExportService;
    provider.setImportExportService(importService);

    const dataTransfer = new DataTransfer();
    dataTransfer.set(
      'application/vnd.code.tree.skilldock.reposkills',
      new DataTransferItem('not-valid-json')
    );

    // Should silently bail out on JSON parse error
    await expect(provider.handleDrop(undefined, dataTransfer)).resolves.not.toThrow();
    expect(importService.exportToLibrary).not.toHaveBeenCalled();
  });

  it('should sort skills by lastModified', async () => {
    for (const [name, ts] of [['alpha', 1000], ['beta', 2000]] as const) {
      const skillDir = path.join(tmpDir, `sort-${name}`);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${name}\n---\nBody`
      );
      // Touch mtime to distinguish
      const t = new Date(ts);
      fs.utimesSync(path.join(skillDir, 'SKILL.md'), t, t);
    }

    // Override getConfiguration mock to return 'lastModified'
    const { workspace } = await import('vscode');
    vi.mocked(workspace.getConfiguration).mockImplementation((section?: string) => ({
      get: (key: string, def?: unknown) => {
        if (key === 'libraryPath') { return tmpDir; }
        if (key === 'librarySortBy') { return 'lastModified'; }
        return def;
      },
    } as any));

    const children = await provider.getChildren();
    expect(children).toHaveLength(2);

    // Restore original mock
    vi.mocked(workspace.getConfiguration).mockImplementation(() => ({
      get: (key: string, def?: unknown) => {
        if (key === 'libraryPath') { return tmpDir; }
        return def;
      },
    } as any));
  });

  it('should sort skills by author', async () => {
    for (const name of ['zskill', 'askill'] as const) {
      const skillDir = path.join(tmpDir, name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${name}\nauthor: ${name}\n---\nBody`
      );
    }

    const { workspace } = await import('vscode');
    vi.mocked(workspace.getConfiguration).mockImplementation(() => ({
      get: (key: string, def?: unknown) => {
        if (key === 'libraryPath') { return tmpDir; }
        if (key === 'librarySortBy') { return 'author'; }
        return def;
      },
    } as any));

    const children = await provider.getChildren();
    expect(children).toHaveLength(2);
    // 'askill' author sorts before 'zskill'
    expect(children[0].skill.metadata.author).toBe('askill');

    vi.mocked(workspace.getConfiguration).mockImplementation(() => ({
      get: (key: string, def?: unknown) => {
        if (key === 'libraryPath') { return tmpDir; }
        return def;
      },
    } as any));
  });

  it('should sort skills by mostUsed', async () => {
    for (const name of ['popular', 'rare'] as const) {
      const skillDir = path.join(tmpDir, name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${name}\n---\nBody`
      );
    }

    const { workspace } = await import('vscode');
    vi.mocked(workspace.getConfiguration).mockImplementation(() => ({
      get: (key: string, def?: unknown) => {
        if (key === 'libraryPath') { return tmpDir; }
        if (key === 'librarySortBy') { return 'mostUsed'; }
        return def;
      },
    } as any));

    const children = await provider.getChildren();
    expect(children).toHaveLength(2);

    vi.mocked(workspace.getConfiguration).mockImplementation(() => ({
      get: (key: string, def?: unknown) => {
        if (key === 'libraryPath') { return tmpDir; }
        return def;
      },
    } as any));
  });

  it('should show error and return empty list when getChildren fails', async () => {
    vi.spyOn(storageService, 'listSkills').mockRejectedValueOnce(new Error('disk error'));

    const children = await provider.getChildren();
    expect(children).toEqual([]);
    expect(vscodeWindow.showErrorMessage).toHaveBeenCalled();
  });
});
