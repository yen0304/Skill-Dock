import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { commands, window as vscodeWindow, workspace } from 'vscode';

let mockLibraryPath = '';
vi.mock('vscode', async () => {
  const actual = await vi.importActual<typeof import('vscode')>('vscode');
  return {
    ...actual,
    workspace: {
      ...actual.workspace,
      workspaceFolders: undefined as unknown,
      getConfiguration: vi.fn(() => ({
        get: (key: string, def?: unknown) => {
          if (key === 'libraryPath') { return mockLibraryPath; }
          if (key === 'marketplaceSources') { return []; }
          return def;
        },
        update: vi.fn().mockResolvedValue(undefined),
      })),
    },
  };
});

import { activate, deactivate } from './extension';
import { SkillTreeItem } from './providers/skillLibraryProvider';
import { MarketplaceSourceItem } from './providers/marketplaceTreeProvider';

describe('extension', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-test-'));
    mockLibraryPath = tmpDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('activate', () => {
    it('should register all expected commands', () => {
      const subscriptions: any[] = [];
      const mockContext = {
        extensionUri: { path: '/mock/extension', fsPath: '/mock/extension' },
        subscriptions,
      } as any;

      activate(mockContext);

      // Check that registerCommand was called for each command
      const registeredCommands = vi.mocked(commands.registerCommand).mock.calls.map(c => c[0]);
      expect(registeredCommands).toContain('skilldock.createSkill');
      expect(registeredCommands).toContain('skilldock.editSkill');
      expect(registeredCommands).toContain('skilldock.viewSkill');
      expect(registeredCommands).toContain('skilldock.deleteSkill');
      expect(registeredCommands).toContain('skilldock.importSkill');
      expect(registeredCommands).toContain('skilldock.importSkillFromRepo');
      expect(registeredCommands).toContain('skilldock.addToLibrary');
      expect(registeredCommands).toContain('skilldock.duplicateSkill');
      expect(registeredCommands).toContain('skilldock.searchSkills');
      expect(registeredCommands).toContain('skilldock.refreshLibrary');
      expect(registeredCommands).toContain('skilldock.refreshRepoSkills');
      expect(registeredCommands).toContain('skilldock.openLibraryFolder');
      expect(registeredCommands).toContain('skilldock.openManager');
      expect(registeredCommands).toContain('skilldock.openMarketplace');
      expect(registeredCommands).toContain('skilldock.openMarketplaceSource');
      expect(registeredCommands).toContain('skilldock.addMarketplaceSource');
      expect(registeredCommands).toContain('skilldock.removeMarketplaceSource');
    });

    it('should create 3 tree views', () => {
      const subscriptions: any[] = [];
      const mockContext = {
        extensionUri: { path: '/mock/extension', fsPath: '/mock/extension' },
        subscriptions,
      } as any;

      vi.mocked(vscodeWindow.createTreeView).mockClear();
      activate(mockContext);

      const treeViewCalls = vi.mocked(vscodeWindow.createTreeView).mock.calls;
      const viewIds = treeViewCalls.map(c => c[0]);
      expect(viewIds).toContain('skilldock.library');
      expect(viewIds).toContain('skilldock.repoSkills');
      expect(viewIds).toContain('skilldock.marketplace');
    });

    it('should create a file system watcher', () => {
      const subscriptions: any[] = [];
      const mockContext = {
        extensionUri: { path: '/mock/extension', fsPath: '/mock/extension' },
        subscriptions,
      } as any;

      activate(mockContext);

      expect(workspace.createFileSystemWatcher).toHaveBeenCalledWith(
        '**/{.claude,.cursor,.codex,.github}/skills/*/SKILL.md'
      );
    });

    it('should add disposables to context.subscriptions', () => {
      const subscriptions: any[] = [];
      const mockContext = {
        extensionUri: { path: '/mock/extension', fsPath: '/mock/extension' },
        subscriptions,
      } as any;

      activate(mockContext);

      // Should have tree views, watcher, and storage dispose
      expect(subscriptions.length).toBeGreaterThan(0);
    });
  });

  describe('deactivate', () => {
    it('should not throw', () => {
      expect(() => deactivate()).not.toThrow();
    });
  });

  describe('command handlers', () => {
    let commandHandlers: Map<string, (...args: unknown[]) => unknown>;

    beforeEach(() => {
      commandHandlers = new Map();
      vi.mocked(commands.registerCommand).mockImplementation((id: string, handler: any) => {
        commandHandlers.set(id, handler);
        return { dispose: () => {} };
      });

      const subscriptions: any[] = [];
      const mockContext = {
        extensionUri: { path: '/mock/extension', fsPath: '/mock/extension' },
        subscriptions,
      } as any;

      activate(mockContext);
    });

    it('refreshLibrary should not throw', () => {
      const handler = commandHandlers.get('skilldock.refreshLibrary');
      expect(handler).toBeDefined();
      expect(() => handler!()).not.toThrow();
    });

    it('refreshRepoSkills should not throw', () => {
      const handler = commandHandlers.get('skilldock.refreshRepoSkills');
      expect(handler).toBeDefined();
      expect(() => handler!()).not.toThrow();
    });

    it('openLibraryFolder should execute revealFileInOS', () => {
      const handler = commandHandlers.get('skilldock.openLibraryFolder');
      expect(handler).toBeDefined();
      handler!();
      expect(commands.executeCommand).toHaveBeenCalledWith('revealFileInOS', expect.anything());
    });

    it('searchSkills should call showInputBox', async () => {
      vi.mocked(vscodeWindow.showInputBox).mockResolvedValue('test query');
      const handler = commandHandlers.get('skilldock.searchSkills');
      expect(handler).toBeDefined();
      await handler!();
      expect(vscodeWindow.showInputBox).toHaveBeenCalled();
    });

    it('searchSkills with undefined query should not crash', async () => {
      vi.mocked(vscodeWindow.showInputBox).mockResolvedValue(undefined);
      const handler = commandHandlers.get('skilldock.searchSkills');
      await handler!();
    });

    it('deleteSkill should show warning and handle cancel', async () => {
      // Create a skill in library
      const skillDir = path.join(tmpDir, 'del-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: Del Skill\ndescription: Desc\n---\nBody'
      );

      // Mock pickSkill: showQuickPick returns skill
      vi.mocked(vscodeWindow.showQuickPick).mockResolvedValue({
        skill: {
          id: 'del-skill',
          metadata: { name: 'Del Skill', description: 'Desc' },
          body: 'Body',
          dirPath: skillDir,
          filePath: path.join(skillDir, 'SKILL.md'),
          lastModified: 0,
        },
      } as any);

      // Cancel deletion
      vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Cancel' as any);

      const handler = commandHandlers.get('skilldock.deleteSkill');
      await handler!();
      // Skill should still exist
      expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
    });

    it('deleteSkill with no skill selected should do nothing', async () => {
      vi.mocked(vscodeWindow.showQuickPick).mockResolvedValue(undefined as any);
      const handler = commandHandlers.get('skilldock.deleteSkill');
      await handler!();
    });

    it('createSkill should not throw', () => {
      const handler = commandHandlers.get('skilldock.createSkill');
      expect(handler).toBeDefined();
      expect(() => handler!()).not.toThrow();
    });

    it('openManager should not throw', () => {
      const handler = commandHandlers.get('skilldock.openManager');
      expect(handler).toBeDefined();
      expect(() => handler!()).not.toThrow();
    });

    it('openMarketplace should not throw', () => {
      const handler = commandHandlers.get('skilldock.openMarketplace');
      expect(handler).toBeDefined();
      expect(() => handler!()).not.toThrow();
    });

    it('openMarketplaceSource should not throw', () => {
      const handler = commandHandlers.get('skilldock.openMarketplaceSource');
      expect(handler).toBeDefined();
      expect(() => handler!()).not.toThrow();
    });

    it('importSkillFromRepo with no item should do nothing', async () => {
      const handler = commandHandlers.get('skilldock.importSkillFromRepo');
      await handler!();
    });

    it('addToLibrary with no item should do nothing', async () => {
      const handler = commandHandlers.get('skilldock.addToLibrary');
      await handler!();
    });

    it('duplicateSkill with no item and cancelled pick should do nothing', async () => {
      vi.mocked(vscodeWindow.showQuickPick).mockResolvedValue(undefined as any);
      const handler = commandHandlers.get('skilldock.duplicateSkill');
      await handler!();
    });

    it('editSkill with no item and cancelled pick should do nothing', async () => {
      vi.mocked(vscodeWindow.showQuickPick).mockResolvedValue(undefined as any);
      const handler = commandHandlers.get('skilldock.editSkill');
      await handler!();
    });

    it('viewSkill with no item and cancelled pick should do nothing', async () => {
      vi.mocked(vscodeWindow.showQuickPick).mockResolvedValue(undefined as any);
      const handler = commandHandlers.get('skilldock.viewSkill');
      await handler!();
    });

    it('importSkill with no item should call interactiveImport', async () => {
      // Library is empty, so interactiveImport shows message
      const handler = commandHandlers.get('skilldock.importSkill');
      await handler!();
      expect(vscodeWindow.showInformationMessage).toHaveBeenCalled();
    });

    it('addMarketplaceSource with cancelled input should do nothing', async () => {
      vi.mocked(vscodeWindow.showInputBox).mockResolvedValue(undefined);
      const handler = commandHandlers.get('skilldock.addMarketplaceSource');
      await handler!();
    });

    it('addMarketplaceSource with valid URL should call addCustomSource and refresh', async () => {
      // The validateInput callback is called by VS Code with the input value;
      // showInputBox resolves with the final string.
      vi.mocked(vscodeWindow.showInputBox).mockResolvedValue('https://github.com/myorg/myskills');

      // The workspace.getConfiguration().update mock is already set up to resolve.
      const handler = commandHandlers.get('skilldock.addMarketplaceSource');
      await handler!();

      // Should show success message (proves addCustomSource didn't throw)
      expect(vscodeWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('myorg/myskills')
      );
    });

    it('removeMarketplaceSource with no item should do nothing', async () => {
      const handler = commandHandlers.get('skilldock.removeMarketplaceSource');
      await handler!();
    });

    // ===========================================
    // Happy path tests
    // ===========================================

    it('deleteSkill with SkillTreeItem should delete on confirm', async () => {
      const skillDir = path.join(tmpDir, 'to-delete');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: Delete Me\ndescription: bye\n---\nBody');

      const skill = {
        id: 'to-delete',
        metadata: { name: 'Delete Me', description: 'bye' },
        body: 'Body',
        dirPath: skillDir,
        filePath: path.join(skillDir, 'SKILL.md'),
        lastModified: Date.now(),
      };
      const treeItem = new SkillTreeItem(skill, 'library');

      vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Delete' as any);

      const handler = commandHandlers.get('skilldock.deleteSkill');
      await handler!(treeItem);

      expect(fs.existsSync(skillDir)).toBe(false);
      expect(vscodeWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Delete Me')
      );
    });

    it('viewSkill with SkillTreeItem should open document', async () => {
      const skillDir = path.join(tmpDir, 'view-me');
      fs.mkdirSync(skillDir, { recursive: true });
      const skillFile = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(skillFile, '---\nname: View Me\ndescription: see\n---\nBody');

      const skill = {
        id: 'view-me',
        metadata: { name: 'View Me', description: 'see' },
        body: 'Body',
        dirPath: skillDir,
        filePath: skillFile,
        lastModified: Date.now(),
      };
      const treeItem = new SkillTreeItem(skill, 'library');

      vi.mocked(workspace.openTextDocument).mockResolvedValue({} as any);

      const handler = commandHandlers.get('skilldock.viewSkill');
      await handler!(treeItem);

      expect(workspace.openTextDocument).toHaveBeenCalledWith(skillFile);
      expect(vscodeWindow.showTextDocument).toHaveBeenCalled();
    });

    it('viewSkill with Skill object should open document', async () => {
      const skillDir = path.join(tmpDir, 'view-direct');
      fs.mkdirSync(skillDir, { recursive: true });
      const skillFile = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(skillFile, '---\nname: Direct\ndescription: d\n---\nBody');

      const skill = {
        id: 'view-direct',
        metadata: { name: 'Direct', description: 'd' },
        body: 'Body',
        dirPath: skillDir,
        filePath: skillFile,
        lastModified: Date.now(),
      };

      vi.mocked(workspace.openTextDocument).mockResolvedValue({} as any);

      const handler = commandHandlers.get('skilldock.viewSkill');
      await handler!(skill);

      expect(workspace.openTextDocument).toHaveBeenCalledWith(skillFile);
    });

    it('editSkill with SkillTreeItem should create editor panel', async () => {
      const skillDir = path.join(tmpDir, 'edit-me');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: Edit Me\ndescription: ed\n---\nBody');

      const skill = {
        id: 'edit-me',
        metadata: { name: 'Edit Me', description: 'ed' },
        body: 'Body',
        dirPath: skillDir,
        filePath: path.join(skillDir, 'SKILL.md'),
        lastModified: Date.now(),
      };
      const treeItem = new SkillTreeItem(skill, 'library');

      const handler = commandHandlers.get('skilldock.editSkill');
      await handler!(treeItem);

      expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledWith(
        'skilldockEditor',
        expect.any(String),
        expect.any(Number),
        expect.objectContaining({ enableScripts: true })
      );
    });

    it('duplicateSkill with SkillTreeItem should create copy', async () => {
      const skillDir = path.join(tmpDir, 'orig-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: Original\ndescription: orig\n---\nBody');

      const skill = {
        id: 'orig-skill',
        metadata: { name: 'Original', description: 'orig' },
        body: 'Body',
        dirPath: skillDir,
        filePath: path.join(skillDir, 'SKILL.md'),
        lastModified: Date.now(),
      };
      const treeItem = new SkillTreeItem(skill, 'library');

      vi.mocked(vscodeWindow.showInputBox).mockResolvedValue('orig-skill-copy');

      const handler = commandHandlers.get('skilldock.duplicateSkill');
      await handler!(treeItem);

      expect(fs.existsSync(path.join(tmpDir, 'orig-skill-copy', 'SKILL.md'))).toBe(true);
      expect(vscodeWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Original')
      );
    });

    it('importSkillFromRepo with SkillTreeItem should save to library', async () => {
      const repoSkillDir = path.join(tmpDir, '__repo', 'repo-skill');
      fs.mkdirSync(repoSkillDir, { recursive: true });
      fs.writeFileSync(path.join(repoSkillDir, 'SKILL.md'), '---\nname: Repo Skill\ndescription: from repo\n---\n# Content');

      const skill = {
        id: 'repo-skill',
        metadata: { name: 'Repo Skill', description: 'from repo' },
        body: '# Content',
        dirPath: repoSkillDir,
        filePath: path.join(repoSkillDir, 'SKILL.md'),
        lastModified: Date.now(),
      };
      const treeItem = new SkillTreeItem(skill, 'repo');

      const handler = commandHandlers.get('skilldock.importSkillFromRepo');
      await handler!(treeItem);

      expect(fs.existsSync(path.join(tmpDir, 'repo-skill', 'SKILL.md'))).toBe(true);
      expect(vscodeWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Repo Skill')
      );
    });

    it('addToLibrary with new skill should add successfully', async () => {
      const repoSkillDir = path.join(tmpDir, '__repo', 'new-add');
      fs.mkdirSync(repoSkillDir, { recursive: true });
      fs.writeFileSync(path.join(repoSkillDir, 'SKILL.md'), '---\nname: New Add\ndescription: adding\n---\n# New');

      const skill = {
        id: 'new-add',
        metadata: { name: 'New Add', description: 'adding' },
        body: '# New',
        dirPath: repoSkillDir,
        filePath: path.join(repoSkillDir, 'SKILL.md'),
        lastModified: Date.now(),
      };
      const treeItem = new SkillTreeItem(skill, 'repo');

      const handler = commandHandlers.get('skilldock.addToLibrary');
      await handler!(treeItem);

      expect(fs.existsSync(path.join(tmpDir, 'new-add', 'SKILL.md'))).toBe(true);
      expect(vscodeWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('New Add')
      );
    });

    it('addToLibrary with existing skill and overwrite should replace', async () => {
      const existingDir = path.join(tmpDir, 'existing-lib');
      fs.mkdirSync(existingDir, { recursive: true });
      fs.writeFileSync(path.join(existingDir, 'SKILL.md'), '---\nname: Old\ndescription: old\n---\n# Old');

      const repoDir = path.join(tmpDir, '__repo', 'existing-lib');
      fs.mkdirSync(repoDir, { recursive: true });
      fs.writeFileSync(path.join(repoDir, 'SKILL.md'), '---\nname: New\ndescription: new\n---\n# New');

      const skill = {
        id: 'existing-lib',
        metadata: { name: 'New', description: 'new' },
        body: '# New',
        dirPath: repoDir,
        filePath: path.join(repoDir, 'SKILL.md'),
        lastModified: Date.now(),
      };
      const treeItem = new SkillTreeItem(skill, 'repo');

      vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Overwrite' as any);

      const handler = commandHandlers.get('skilldock.addToLibrary');
      await handler!(treeItem);

      expect(fs.existsSync(path.join(tmpDir, 'existing-lib', 'SKILL.md'))).toBe(true);
      expect(vscodeWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('New')
      );
    });

    it('addToLibrary with existing skill and skip should do nothing', async () => {
      const existingDir = path.join(tmpDir, 'skip-me');
      fs.mkdirSync(existingDir, { recursive: true });
      fs.writeFileSync(path.join(existingDir, 'SKILL.md'), '---\nname: Skip\ndescription: skip\n---\n# Old');

      const repoDir = path.join(tmpDir, '__repo', 'skip-me');
      fs.mkdirSync(repoDir, { recursive: true });
      fs.writeFileSync(path.join(repoDir, 'SKILL.md'), '---\nname: Skip New\ndescription: new\n---\n# New');

      const skill = {
        id: 'skip-me',
        metadata: { name: 'Skip New', description: 'new' },
        body: '# New',
        dirPath: repoDir,
        filePath: path.join(repoDir, 'SKILL.md'),
        lastModified: Date.now(),
      };
      const treeItem = new SkillTreeItem(skill, 'repo');

      vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Skip' as any);

      const handler = commandHandlers.get('skilldock.addToLibrary');
      await handler!(treeItem);

      const content = fs.readFileSync(path.join(tmpDir, 'skip-me', 'SKILL.md'), 'utf-8');
      expect(content).toContain('Old');
    });

    it('importSkill with SkillTreeItem should import to workspace', async () => {
      const skillDir = path.join(tmpDir, 'import-me');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: Import Me\ndescription: imp\n---\nBody');

      const skill = {
        id: 'import-me',
        metadata: { name: 'Import Me', description: 'imp' },
        body: 'Body',
        dirPath: skillDir,
        filePath: path.join(skillDir, 'SKILL.md'),
        lastModified: Date.now(),
      };
      const treeItem = new SkillTreeItem(skill, 'library');

      const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-ws-'));
      (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpWorkspace } }];

      vi.mocked(vscodeWindow.showQuickPick).mockResolvedValue({ format: 'claude' } as any);

      const handler = commandHandlers.get('skilldock.importSkill');
      await handler!(treeItem);

      expect(fs.existsSync(path.join(tmpWorkspace, '.claude', 'skills', 'import-me', 'SKILL.md'))).toBe(true);
      expect(vscodeWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Import Me')
      );

      (workspace as any).workspaceFolders = undefined;
      fs.rmSync(tmpWorkspace, { recursive: true, force: true });
    });

    it('removeMarketplaceSource with confirm should remove source', async () => {
      const source = {
        id: 'testorg/custom-skills',
        owner: 'testorg',
        repo: 'custom-skills',
        branch: 'main',
        path: '',
        label: 'Test Org / Custom Skills',
        isBuiltin: false,
      };
      const sourceItem = new MarketplaceSourceItem(source);

      vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Remove' as any);

      const handler = commandHandlers.get('skilldock.removeMarketplaceSource');
      await handler!(sourceItem);

      // Handler should complete without errors (removeCustomSource updates config)
      expect(vscodeWindow.showErrorMessage).not.toHaveBeenCalled();
    });

    it('addMarketplaceSource with error should show error message', async () => {
      vi.mocked(vscodeWindow.showInputBox).mockResolvedValue('https://github.com/org/repo');

      // Make the URL a duplicate so addCustomSource throws
      const getConfig = vi.mocked(workspace.getConfiguration);
      getConfig.mockReturnValueOnce({
        get: (_key: string, def?: unknown) => {
          if (_key === 'marketplaceSources') { return ['https://github.com/org/repo']; }
          return def;
        },
        update: vi.fn().mockResolvedValue(undefined),
      } as any);

      const handler = commandHandlers.get('skilldock.addMarketplaceSource');
      await handler!();

      expect(vscodeWindow.showErrorMessage).toHaveBeenCalled();
    });
  });
});
