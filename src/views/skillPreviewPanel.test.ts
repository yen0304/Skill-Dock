import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkillPreviewPanel } from './skillPreviewPanel';
import { window as vscodeWindow } from 'vscode';
import { Skill } from '../models/skill';

vi.mock('vscode', async () => {
  const actual = await vi.importActual<typeof import('vscode')>('vscode');
  return {
    ...actual,
  };
});

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

// Helper to create a mock webview panel that captures the message handler
function createMockWebviewPanel() {
  let messageHandler: ((msg: any) => Promise<void>) | undefined;
  let disposeHandler: (() => void) | undefined;
  const panel = {
    title: '',
    webview: {
      html: '',
      onDidReceiveMessage: vi.fn((cb: any, _thisArg?: any, disposables?: any[]) => {
        messageHandler = cb;
        const d = { dispose: () => {} };
        if (disposables) { disposables.push(d); }
        return d;
      }),
      postMessage: vi.fn(),
    },
    onDidDispose: vi.fn((cb: any, _thisArg?: any, disposables?: any[]) => {
      disposeHandler = cb;
      const d = { dispose: () => {} };
      if (disposables) { disposables.push(d); }
      return d;
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

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'test-skill',
    metadata: {
      name: 'Test Skill',
      description: 'A test skill description',
      author: 'Tester',
      version: '1.0.0',
      license: 'MIT',
      tags: ['test', 'demo'],
    },
    body: '# Test Skill\n\nSome content here.',
    dirPath: '/mock/skills/test-skill',
    filePath: '/mock/skills/test-skill/SKILL.md',
    lastModified: Date.now(),
    ...overrides,
  };
}

describe('SkillPreviewPanel', () => {
  beforeEach(() => {
    SkillPreviewPanel.currentPanels.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    SkillPreviewPanel.currentPanels.clear();
  });

  describe('createOrShow', () => {
    it('should create a new panel', () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill();
      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledWith(
        'skilldockPreview',
        'Test Skill',
        expect.any(Number),
        expect.objectContaining({ enableScripts: true }),
      );
      expect(SkillPreviewPanel.currentPanels.has('test-skill')).toBe(true);
    });

    it('should reveal existing panel for same skill', () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill();
      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      // Create again with same skill id
      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      expect(mock.panel.reveal).toHaveBeenCalled();
      // Should only create once
      expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledTimes(1);
    });

    it('should generate HTML with metadata', () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill();
      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const html = mock.panel.webview.html;
      expect(html).toContain('Test Skill');
      expect(html).toContain('Tester');
      expect(html).toContain('1.0.0');
      expect(html).toContain('MIT');
      expect(html).toContain('test');
      expect(html).toContain('demo');
    });

    it('should generate HTML without optional metadata', () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill({
        metadata: { name: 'Minimal', description: 'desc' },
        body: '',
      });

      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const html = mock.panel.webview.html;
      expect(html).toContain('Minimal');
      expect(html).toContain('No content available');
    });

    it('should show install count when present', () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill({ installCount: 42 });

      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const html = mock.panel.webview.html;
      expect(html).toContain('42');
    });

    it('should show additional files in sidebar', () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill({
        additionalFiles: ['config.json', 'helper.js'],
      });

      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const html = mock.panel.webview.html;
      expect(html).toContain('config.json');
      expect(html).toContain('helper.js');
    });

    it('should show folders in the file tree', () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill({
        additionalFiles: ['scripts/', 'scripts/setup.sh', 'readme.txt'],
      });

      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const html = mock.panel.webview.html;
      expect(html).toContain('scripts');
      expect(html).toContain('setup.sh');
    });

    it('should pass onAction callback', () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const onAction = vi.fn();
      const skill = makeSkill();

      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
        onAction,
      );

      expect(SkillPreviewPanel.currentPanels.has('test-skill')).toBe(true);
    });
  });

  describe('message handlers', () => {
    it('should handle edit message via onAction', async () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const onAction = vi.fn();
      const skill = makeSkill();

      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
        onAction,
      );

      const handler = mock.getMessageHandler()!;
      expect(handler).toBeDefined();

      await handler({ command: 'edit' });
      expect(onAction).toHaveBeenCalledWith('edit', skill);
    });

    it('should handle import message via onAction', async () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const onAction = vi.fn();
      const skill = makeSkill();

      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
        onAction,
      );

      const handler = mock.getMessageHandler()!;
      await handler({ command: 'import' });
      expect(onAction).toHaveBeenCalledWith('import', skill);
    });

    it('should handle readFile for markdown files', async () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill();
      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const handler = mock.getMessageHandler()!;
      const fsMock = await import('fs/promises');
      vi.mocked(fsMock.readFile).mockResolvedValue('# File Content');

      await handler({
        command: 'readFile',
        filePath: '/mock/skills/test-skill/doc.md',
      });

      expect(mock.panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'fileContent',
          isMarkdown: true,
        }),
      );
    });

    it('should handle readFile for non-markdown files', async () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill();
      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const handler = mock.getMessageHandler()!;
      const fsMock = await import('fs/promises');
      vi.mocked(fsMock.readFile).mockResolvedValue('console.log("hello")');

      await handler({
        command: 'readFile',
        filePath: '/mock/skills/test-skill/script.js',
      });

      expect(mock.panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'fileContent',
          isMarkdown: false,
        }),
      );
    });

    it('should handle readFile error', async () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill();
      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const handler = mock.getMessageHandler()!;
      const fsMock = await import('fs/promises');
      vi.mocked(fsMock.readFile).mockRejectedValue(new Error('ENOENT'));

      await handler({
        command: 'readFile',
        filePath: '/mock/skills/test-skill/missing.txt',
      });

      expect(mock.panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'fileContent',
          error: expect.stringContaining('ENOENT'),
        }),
      );
    });

    it('should reject readFile with path traversal', async () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill();
      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const handler = mock.getMessageHandler()!;
      const fsMock = await import('fs/promises');

      await handler({
        command: 'readFile',
        filePath: '/etc/passwd',
      });

      // Should NOT have called readFile since path is outside skill dir
      expect(fsMock.readFile).not.toHaveBeenCalled();
    });

    it('should reject openFile with path traversal', async () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill();
      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const handler = mock.getMessageHandler()!;
      const { workspace } = await import('vscode');

      await handler({
        command: 'openFile',
        filePath: '/etc/passwd',
      });

      expect(workspace.openTextDocument).not.toHaveBeenCalled();
    });

    it('should handle openFile within skill dir', async () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill();
      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const handler = mock.getMessageHandler()!;
      const { workspace, window: vscWindow } = await import('vscode');
      vi.mocked(workspace.openTextDocument).mockResolvedValue({} as any);
      vi.mocked(vscWindow.showTextDocument).mockResolvedValue({} as any);

      await handler({
        command: 'openFile',
        filePath: '/mock/skills/test-skill/SKILL.md',
      });

      expect(workspace.openTextDocument).toHaveBeenCalled();
      expect(vscWindow.showTextDocument).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should remove from currentPanels on dispose', () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        makeSkill(),
      );

      expect(SkillPreviewPanel.currentPanels.has('test-skill')).toBe(true);

      const disposeHandler = mock.getDisposeHandler()!;
      disposeHandler();

      expect(SkillPreviewPanel.currentPanels.has('test-skill')).toBe(false);
    });
  });

  describe('file icons', () => {
    it('should assign correct icons for different file types', () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill({
        additionalFiles: [
          'helper.js',
          'config.json',
          'notes.txt',
          'run.sh',
          'main.py',
          'unknown.xyz',
        ],
      });

      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const html = mock.panel.webview.html;
      // Just verify the file names appear; icons are emoji-based
      expect(html).toContain('helper.js');
      expect(html).toContain('config.json');
      expect(html).toContain('notes.txt');
      expect(html).toContain('run.sh');
      expect(html).toContain('main.py');
      expect(html).toContain('unknown.xyz');
    });
  });

  describe('compatibility metadata', () => {
    it('should show compatibility in metadata', () => {
      const mock = createMockWebviewPanel();
      vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

      const skill = makeSkill({
        metadata: {
          name: 'Compat Skill',
          description: 'desc',
          compatibility: 'Claude 3.5+',
        },
      });

      SkillPreviewPanel.createOrShow(
        { path: '/mock/ext', fsPath: '/mock/ext' } as any,
        skill,
      );

      const html = mock.panel.webview.html;
      expect(html).toContain('Claude 3.5+');
    });
  });
});
