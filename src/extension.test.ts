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
  });
});
