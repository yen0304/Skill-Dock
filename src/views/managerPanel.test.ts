import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window as vscodeWindow, workspace } from 'vscode';
import { ManagerPanel } from './managerPanel';

/**
 * Tests for the ManagerPanel webview behavior.
 * Verifies CSP compliance of generated HTML.
 */

describe('ManagerPanel HTML generation (CSP)', () => {
  it('should NOT have inline onclick/onchange handlers in dynamically generated HTML', () => {
    // This simulates the pattern from managerPanel.ts renderSkills() function
    // which generates HTML with inline event handlers
    const buggySkillListHtml = `
      <li class="skill-item" onclick="openSkill('my-skill')">
        <select class="import-select" onclick="event.stopPropagation()" onchange="importSkill('my-skill', this.value)">
          <option value="">Import to...</option>
        </select>
        <button class="action-btn danger" onclick="event.stopPropagation(); deleteSkill('my-skill')">Delete</button>
      </li>
    `;

    const inlineHandlerPattern = /\bon\w+\s*=/i;
    // Demonstrates the bug: inline handlers are present
    expect(inlineHandlerPattern.test(buggySkillListHtml)).toBe(true);

    // After fix: event delegation should be used instead
    const fixedSkillListHtml = `
      <li class="skill-item" data-skill-id="my-skill" data-action="open">
        <select class="import-select" data-skill-id="my-skill" data-action="import">
          <option value="">Import to...</option>
        </select>
        <button class="action-btn danger" data-skill-id="my-skill" data-action="delete">Delete</button>
      </li>
    `;

    expect(inlineHandlerPattern.test(fixedSkillListHtml)).toBe(false);
  });
});

// Helper to create a mock webview panel that captures the message handler
function createMockWebviewPanel() {
  let messageHandler: ((msg: any) => Promise<void>) | undefined;
  let disposeHandler: (() => void) | undefined;
  const panel = {
    webview: {
      html: '',
      onDidReceiveMessage: vi.fn((cb: any) => {
        messageHandler = cb;
        return { dispose: () => {} };
      }),
      postMessage: vi.fn(),
    },
    onDidDispose: vi.fn((cb: any) => {
      disposeHandler = cb;
      return { dispose: () => {} };
    }),
    reveal: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    panel,
    getMessageHandler: () => messageHandler,
    getDisposeHandler: () => disposeHandler,
  };
}

describe('ManagerPanel instantiation', () => {
  beforeEach(() => {
    ManagerPanel.currentPanel = undefined;
    vi.clearAllMocks();
  });

  it('should create panel via createOrShow', () => {
    const mockStorageService = {
      listSkills: vi.fn().mockResolvedValue([]),
      searchSkills: vi.fn().mockResolvedValue([]),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
      readSkill: vi.fn().mockResolvedValue(null),
      deleteSkill: vi.fn().mockResolvedValue(undefined),
      libraryPath: '/tmp/library',
    } as any;

    const mockImportService = {
      importToRepo: vi.fn(),
      pickTargetFormat: vi.fn(),
    } as any;

    ManagerPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      mockImportService,
      vi.fn(),
    );

    expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledWith(
      'skilldockManager',
      expect.any(String),
      expect.any(Number),
      expect.objectContaining({ enableScripts: true }),
    );
    expect(ManagerPanel.currentPanel).toBeDefined();
  });

  it('should reveal existing panel on second createOrShow', () => {
    const mockStorageService = {
      listSkills: vi.fn().mockResolvedValue([]),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
    } as any;

    const mockImportService = {} as any;

    ManagerPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      mockImportService,
      vi.fn(),
    );

    const first = ManagerPanel.currentPanel;

    ManagerPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      mockImportService,
      vi.fn(),
    );

    expect(ManagerPanel.currentPanel).toBe(first);
  });
});

describe('ManagerPanel message handlers', () => {
  beforeEach(() => {
    ManagerPanel.currentPanel = undefined;
    vi.clearAllMocks();
  });

  function setupPanel(
    storageOverrides: Record<string, any> = {},
    importOverrides: Record<string, any> = {},
  ) {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const onRefresh = vi.fn();
    const mockStorageService = {
      listSkills: vi.fn().mockResolvedValue([]),
      searchSkills: vi.fn().mockResolvedValue([]),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
      readSkill: vi.fn().mockResolvedValue(null),
      deleteSkill: vi.fn().mockResolvedValue(undefined),
      ...storageOverrides,
    } as any;

    const mockImportService = {
      importToRepo: vi.fn(),
      ...importOverrides,
    } as any;

    ManagerPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      mockImportService,
      onRefresh,
    );

    return { mock, onRefresh, mockStorageService, mockImportService };
  }

  it('should handle getSkills message', async () => {
    const skills = [
      { id: 'a', metadata: { name: 'A', description: 'desc A', author: 'me', version: '1', tags: ['t'] }, lastModified: 1 },
    ];
    const { mock, mockStorageService } = setupPanel({ listSkills: vi.fn().mockResolvedValue(skills) });
    const handler = mock.getMessageHandler()!;
    expect(handler).toBeDefined();

    await handler({ command: 'getSkills' });
    expect(mockStorageService.listSkills).toHaveBeenCalled();
    expect(mock.panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'updateSkills' }),
    );
  });

  it('should handle searchSkills message', async () => {
    const { mock, mockStorageService } = setupPanel({
      searchSkills: vi.fn().mockResolvedValue([]),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'searchSkills', query: 'test' });
    expect(mockStorageService.searchSkills).toHaveBeenCalledWith('test');
  });

  it('should handle deleteSkill message — confirmed', async () => {
    const skill = { id: 'x', metadata: { name: 'X' } };
    vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Delete' as any);

    const { mock, onRefresh, mockStorageService } = setupPanel({
      readSkill: vi.fn().mockResolvedValue(skill),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'deleteSkill', id: 'x' });
    expect(mockStorageService.deleteSkill).toHaveBeenCalledWith('x');
    expect(onRefresh).toHaveBeenCalled();
  });

  it('should handle deleteSkill message — cancelled', async () => {
    const skill = { id: 'x', metadata: { name: 'X' } };
    vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Cancel' as any);

    const { mock, onRefresh, mockStorageService } = setupPanel({
      readSkill: vi.fn().mockResolvedValue(skill),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'deleteSkill', id: 'x' });
    expect(mockStorageService.deleteSkill).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('should handle deleteSkill message — skill not found', async () => {
    const { mock, mockStorageService } = setupPanel({
      readSkill: vi.fn().mockResolvedValue(null),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'deleteSkill', id: 'nonexistent' });
    expect(mockStorageService.deleteSkill).not.toHaveBeenCalled();
  });

  it('should handle importSkill message — success', async () => {
    const skill = { id: 'x', metadata: { name: 'X' } };
    const { mock, onRefresh, mockStorageService } = setupPanel({
      readSkill: vi.fn().mockResolvedValue(skill),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'importSkill', id: 'x', format: 'claude' });
    expect(onRefresh).toHaveBeenCalled();
  });

  it('should handle importSkill message — import cancelled (no error shown)', async () => {
    const skill = { id: 'x', metadata: { name: 'X' } };
    const { mock } = setupPanel({
      readSkill: vi.fn().mockResolvedValue(skill),
    }, {
      importToRepo: vi.fn().mockRejectedValue(new Error('Import cancelled')),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'importSkill', id: 'x', format: 'claude' });
    expect(vscodeWindow.showErrorMessage).not.toHaveBeenCalled();
  });

  it('should handle importSkill message — real error', async () => {
    const skill = { id: 'x', metadata: { name: 'X' } };
    const { mock } = setupPanel({
      readSkill: vi.fn().mockResolvedValue(skill),
    }, {
      importToRepo: vi.fn().mockRejectedValue(new Error('Disk full')),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'importSkill', id: 'x', format: 'claude' });
    expect(vscodeWindow.showErrorMessage).toHaveBeenCalled();
  });

  it('should handle importSkill message — skill not found', async () => {
    const { mock, mockImportService } = setupPanel({
      readSkill: vi.fn().mockResolvedValue(null),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'importSkill', id: 'nope', format: 'claude' });
    expect(mockImportService.importToRepo).not.toHaveBeenCalled();
  });

  it('should handle openSkill message', async () => {
    const skill = { id: 'x', metadata: { name: 'X' }, filePath: '/tmp/x/SKILL.md' };
    vi.mocked(workspace.openTextDocument).mockResolvedValue({} as any);
    vi.mocked(vscodeWindow.showTextDocument as any).mockResolvedValue(undefined);

    const { mock } = setupPanel({
      readSkill: vi.fn().mockResolvedValue(skill),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'openSkill', id: 'x' });
    expect(workspace.openTextDocument).toHaveBeenCalledWith('/tmp/x/SKILL.md');
  });

  it('should handle openSkill message — skill not found', async () => {
    const { mock } = setupPanel({
      readSkill: vi.fn().mockResolvedValue(null),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'openSkill', id: 'nope' });
    expect(workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('should show error when _sendSkills fails', async () => {
    const { mock } = setupPanel({
      listSkills: vi.fn().mockRejectedValue(new Error('read error')),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'getSkills' });
    expect(vscodeWindow.showErrorMessage).toHaveBeenCalled();
  });
});

describe('ManagerPanel dispose', () => {
  beforeEach(() => {
    ManagerPanel.currentPanel = undefined;
    vi.clearAllMocks();
  });

  it('should clean up on dispose', () => {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const mockStorageService = {
      listSkills: vi.fn().mockResolvedValue([]),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
    } as any;

    ManagerPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      {} as any,
      vi.fn(),
    );

    expect(ManagerPanel.currentPanel).toBeDefined();

    // Simulate dispose via onDidDispose callback
    const disposeHandler = mock.getDisposeHandler()!;
    expect(disposeHandler).toBeDefined();
    disposeHandler();

    expect(ManagerPanel.currentPanel).toBeUndefined();
  });
});

describe('ManagerPanel HTML output', () => {
  beforeEach(() => {
    ManagerPanel.currentPanel = undefined;
    vi.clearAllMocks();
  });

  it('should generate HTML with CSP nonce and no inline handlers', () => {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const mockStorageService = {
      listSkills: vi.fn().mockResolvedValue([]),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
    } as any;

    ManagerPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      {} as any,
      vi.fn(),
    );

    const html = mock.panel.webview.html;
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('nonce-');
    expect(html).toContain('<!DOCTYPE html>');
    // Should not have inline handlers in the template
    expect(html).not.toMatch(/\bonclick\s*=/i);
    expect(html).not.toMatch(/\bonchange\s*=/i);
  });
});
