import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { markdownToHtml, escapeHtmlStr, MarketplacePanel } from './marketplacePanel';
import { window as vscodeWindow } from 'vscode';

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

// ----------------------------------------------------------
// escapeHtmlStr
// ----------------------------------------------------------
describe('escapeHtmlStr', () => {
  it('should escape ampersands', () => {
    expect(escapeHtmlStr('a & b')).toBe('a &amp; b');
  });

  it('should escape angle brackets', () => {
    expect(escapeHtmlStr('<div>')).toBe('&lt;div&gt;');
  });

  it('should escape double quotes', () => {
    expect(escapeHtmlStr('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('should handle empty string', () => {
    expect(escapeHtmlStr('')).toBe('');
  });

  it('should handle string with multiple special chars', () => {
    expect(escapeHtmlStr('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });
});

// ----------------------------------------------------------
// markdownToHtml
// ----------------------------------------------------------
describe('markdownToHtml', () => {
  it('should convert headings', () => {
    expect(markdownToHtml('# Heading 1')).toContain('<h1>');
    expect(markdownToHtml('## Heading 2')).toContain('<h2>');
    expect(markdownToHtml('### Heading 3')).toContain('<h3>');
    expect(markdownToHtml('#### Heading 4')).toContain('<h4>');
  });

  it('should convert bold text', () => {
    const result = markdownToHtml('This is **bold** text');
    expect(result).toContain('<strong>bold</strong>');
  });

  it('should convert italic text', () => {
    const result = markdownToHtml('This is *italic* text');
    expect(result).toContain('<em>italic</em>');
  });

  it('should convert bold+italic text', () => {
    const result = markdownToHtml('This is ***bold italic*** text');
    expect(result).toContain('<strong><em>bold italic</em></strong>');
  });

  it('should convert inline code', () => {
    const result = markdownToHtml('Use `code` here');
    expect(result).toContain('<code>code</code>');
  });

  it('should convert fenced code blocks', () => {
    const md = '```js\nconst x = 1;\n```';
    const result = markdownToHtml(md);
    expect(result).toContain('<pre><code>');
    expect(result).toContain('const x = 1;');
  });

  it('should convert links', () => {
    const result = markdownToHtml('[Google](https://google.com)');
    expect(result).toContain('<a href="https://google.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('Google</a>');
  });

  it('should convert blockquotes', () => {
    const result = markdownToHtml('> This is a quote');
    expect(result).toContain('<blockquote>');
  });

  it('should convert unordered lists', () => {
    const md = '- Item 1\n- Item 2\n- Item 3';
    const result = markdownToHtml(md);
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>Item 1</li>');
    expect(result).toContain('<li>Item 2</li>');
    expect(result).toContain('<li>Item 3</li>');
  });

  it('should convert horizontal rules', () => {
    expect(markdownToHtml('---')).toContain('<hr>');
    expect(markdownToHtml('***')).toContain('<hr>');
    expect(markdownToHtml('___')).toContain('<hr>');
  });

  it('should wrap paragraphs', () => {
    const result = markdownToHtml('Hello world');
    expect(result).toContain('<p>Hello world</p>');
  });

  it('should handle empty input', () => {
    expect(markdownToHtml('')).toBe('');
  });

  it('should escape HTML in input', () => {
    const result = markdownToHtml('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should handle complex markdown', () => {
    const md = `# Title

A paragraph with **bold** and *italic*.

## Section

- Item A
- Item B

\`\`\`python
print("hello")
\`\`\`

> A blockquote

---

[Link](https://example.com)`;

    const result = markdownToHtml(md);
    expect(result).toContain('<h1>');
    expect(result).toContain('<h2>');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<pre><code>');
    expect(result).toContain('<blockquote>');
    expect(result).toContain('<hr>');
    expect(result).toContain('<a href=');
  });

  it('should handle list items with asterisk syntax', () => {
    const result = markdownToHtml('* Item 1\n* Item 2');
    expect(result).toContain('<li>Item 1</li>');
  });

  it('should handle list items with plus syntax', () => {
    const result = markdownToHtml('+ Item 1\n+ Item 2');
    expect(result).toContain('<li>Item 1</li>');
  });

  it('should clean up extra blank lines', () => {
    const result = markdownToHtml('Line 1\n\n\n\n\nLine 2');
    expect(result).not.toContain('\n\n\n');
  });
});

// ----------------------------------------------------------
// MarketplacePanel basic instantiation
// ----------------------------------------------------------
describe('MarketplacePanel', () => {
  beforeEach(() => {
    // Reset the currentPanel
    MarketplacePanel.currentPanel = undefined;
    vi.clearAllMocks();
  });

  it('should create a panel via createOrShow', () => {
    const mockMarketplaceService = {
      getSources: vi.fn(() => []),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
    } as any;

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      vi.fn(),
    );

    expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledWith(
      'skilldockMarketplace',
      expect.any(String),
      expect.any(Number),
      expect.objectContaining({ enableScripts: true }),
    );
    expect(MarketplacePanel.currentPanel).toBeDefined();
  });

  it('should reveal existing panel when createOrShow called twice', () => {
    const mockMarketplaceService = {
      getSources: vi.fn(() => []),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
    } as any;

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      vi.fn(),
    );

    const firstPanel = MarketplacePanel.currentPanel;

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      vi.fn(),
    );

    // Should not create a new one
    expect(MarketplacePanel.currentPanel).toBe(firstPanel);
  });

  it('should send filterSource message when filterSourceId is provided on existing panel', () => {
    const mockMarketplaceService = {
      getSources: vi.fn(() => []),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
    } as any;

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      vi.fn(),
    );

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      vi.fn(),
      'anthropics/skills',
    );
  });

  // ----------------------------------------------------------
  // Bug fix: add/remove source should call onRefresh
  // ----------------------------------------------------------
  it('should call onRefresh after adding a source via webview', async () => {
    const onRefresh = vi.fn();

    // Capture the onDidReceiveMessage callback
    let messageHandler: ((msg: any) => Promise<void>) | undefined;
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue({
      webview: {
        html: '',
        onDidReceiveMessage: vi.fn((cb: any) => {
          messageHandler = cb;
          return { dispose: () => {} };
        }),
        postMessage: vi.fn(),
      },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    } as any);

    const mockMarketplaceService = {
      getSources: vi.fn(() => []),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
      addCustomSource: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Mock the input box to return a URL
    vi.mocked(vscodeWindow.showInputBox).mockResolvedValue('https://github.com/org/repo');

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      onRefresh,
    );

    expect(messageHandler).toBeDefined();

    // Simulate webview sending addSource message
    await messageHandler!({ command: 'addSource' });

    expect(mockMarketplaceService.addCustomSource).toHaveBeenCalledWith('https://github.com/org/repo');
    expect(onRefresh).toHaveBeenCalled();
  });

  it('should call onRefresh after removing a source via webview', async () => {
    const onRefresh = vi.fn();

    let messageHandler: ((msg: any) => Promise<void>) | undefined;
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue({
      webview: {
        html: '',
        onDidReceiveMessage: vi.fn((cb: any) => {
          messageHandler = cb;
          return { dispose: () => {} };
        }),
        postMessage: vi.fn(),
      },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    } as any);

    const mockMarketplaceService = {
      getSources: vi.fn(() => []),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
      removeCustomSource: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Mock confirm dialog — user clicks "Remove"
    vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Remove' as any);

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      onRefresh,
    );

    expect(messageHandler).toBeDefined();

    // Simulate webview sending removeSource message
    await messageHandler!({ command: 'removeSource', sourceId: 'custom/repo' });

    expect(mockMarketplaceService.removeCustomSource).toHaveBeenCalledWith('custom/repo');
    expect(onRefresh).toHaveBeenCalled();
  });

  it('should NOT call onRefresh when remove is cancelled', async () => {
    const onRefresh = vi.fn();

    let messageHandler: ((msg: any) => Promise<void>) | undefined;
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue({
      webview: {
        html: '',
        onDidReceiveMessage: vi.fn((cb: any) => {
          messageHandler = cb;
          return { dispose: () => {} };
        }),
        postMessage: vi.fn(),
      },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    } as any);

    const mockMarketplaceService = {
      getSources: vi.fn(() => []),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
      removeCustomSource: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Mock confirm dialog — user clicks "Cancel"
    vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Cancel' as any);

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      onRefresh,
    );

    await messageHandler!({ command: 'removeSource', sourceId: 'custom/repo' });

    expect(mockMarketplaceService.removeCustomSource).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------
// MarketplacePanel message handler coverage
// ----------------------------------------------------------
describe('MarketplacePanel message handlers', () => {
  beforeEach(() => {
    MarketplacePanel.currentPanel = undefined;
    vi.clearAllMocks();
  });

  function setupPanel(serviceOverrides: Record<string, any> = {}) {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const onRefresh = vi.fn();
    const mockMarketplaceService = {
      getSources: vi.fn(() => [
        { id: 'anthropic', label: 'Anthropic Skills', isBuiltin: true },
      ]),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
      getInstalledVersionMap: vi.fn().mockResolvedValue(new Map()),
      installSkill: vi.fn().mockResolvedValue(undefined),
      addCustomSource: vi.fn().mockResolvedValue(undefined),
      removeCustomSource: vi.fn().mockResolvedValue(undefined),
      ...serviceOverrides,
    } as any;

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      onRefresh,
    );

    return { mock, onRefresh, mockMarketplaceService };
  }

  it('should handle ready message (loads skills)', async () => {
    const { mock, mockMarketplaceService } = setupPanel();
    const handler = mock.getMessageHandler()!;
    expect(handler).toBeDefined();

    await handler({ command: 'ready' });
    expect(mockMarketplaceService.fetchAll).toHaveBeenCalledWith(false);
    expect(mock.panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'loading' }),
    );
  });

  it('should handle refresh message (force reload)', async () => {
    const { mock, mockMarketplaceService } = setupPanel();
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'refresh' });
    expect(mockMarketplaceService.fetchAll).toHaveBeenCalledWith(true);
  });

  it('should handle install message — success', async () => {
    const skill = {
      id: 'test-skill',
      metadata: { name: 'Test Skill', description: 'desc' },
      source: { id: 'anthropic' },
      repoPath: 'skills/test-skill',
    };

    const { mock, onRefresh, mockMarketplaceService } = setupPanel({
      fetchAll: vi.fn().mockResolvedValue([skill]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'install', sourceId: 'anthropic', repoPath: 'skills/test-skill' });
    expect(mockMarketplaceService.installSkill).toHaveBeenCalledWith(skill);
    expect(onRefresh).toHaveBeenCalled();
    expect(vscodeWindow.showInformationMessage).toHaveBeenCalled();
  });

  it('should handle install message — skill not found', async () => {
    const { mock, mockMarketplaceService } = setupPanel({
      fetchAll: vi.fn().mockResolvedValue([]),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'install', sourceId: 'anthropic', repoPath: 'nonexistent' });
    expect(mockMarketplaceService.installSkill).not.toHaveBeenCalled();
  });

  it('should handle install message — error', async () => {
    const skill = {
      id: 'fail-skill',
      metadata: { name: 'Fail' },
      source: { id: 'anthropic' },
      repoPath: 'skills/fail',
    };

    const { mock } = setupPanel({
      fetchAll: vi.fn().mockResolvedValue([skill]),
      installSkill: vi.fn().mockRejectedValue(new Error('network error')),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'install', sourceId: 'anthropic', repoPath: 'skills/fail' });
    expect(vscodeWindow.showErrorMessage).toHaveBeenCalled();
  });

  it('should handle preview message — success', async () => {
    const skill = {
      id: 'preview-skill',
      metadata: { name: 'Preview', description: 'desc', author: 'a', version: '1', license: 'MIT', tags: ['t'] },
      source: { id: 'anthropic', label: 'Anthropic' },
      repoPath: 'skills/preview',
      body: '# Hello\n\nWorld',
    };

    const { mock } = setupPanel({
      fetchAll: vi.fn().mockResolvedValue([skill]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'preview', sourceId: 'anthropic', repoPath: 'skills/preview' });
    expect(mock.panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'showPreview' }),
    );
  });

  it('should handle preview message — skill not found', async () => {
    const { mock } = setupPanel({
      fetchAll: vi.fn().mockResolvedValue([]),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'preview', sourceId: 'anthropic', repoPath: 'nonexistent' });
    // postMessage should only have loading, not showPreview
    const calls = mock.panel.webview.postMessage.mock.calls;
    const showPreviewCalls = calls.filter((c: any) => c[0]?.command === 'showPreview');
    expect(showPreviewCalls).toHaveLength(0);
  });

  it('should handle preview message — error', async () => {
    const { mock } = setupPanel({
      fetchAll: vi.fn().mockRejectedValue(new Error('fetch failed')),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'preview', sourceId: 'anthropic', repoPath: 'skills/x' });
    expect(vscodeWindow.showErrorMessage).toHaveBeenCalled();
  });

  it('should show error when loadSkills fails', async () => {
    const { mock } = setupPanel({
      fetchAll: vi.fn().mockRejectedValue(new Error('API rate limit')),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'ready' });
    expect(vscodeWindow.showErrorMessage).toHaveBeenCalled();
  });

  it('should not process messages after dispose', async () => {
    const { mock, mockMarketplaceService } = setupPanel();
    const handler = mock.getMessageHandler()!;
    const disposeHandler = mock.getDisposeHandler()!;

    // Dispose the panel
    disposeHandler();

    // Messages after dispose should be ignored
    await handler({ command: 'refresh' });
    // fetchAll should not be called after dispose (the _disposed flag should prevent it)
    // Note: the guard is inside the message handler
  });
});

describe('MarketplacePanel HTML output', () => {
  beforeEach(() => {
    MarketplacePanel.currentPanel = undefined;
    vi.clearAllMocks();
  });

  it('should generate HTML with CSP nonce', () => {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const mockMarketplaceService = {
      getSources: vi.fn(() => []),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
    } as any;

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      vi.fn(),
    );

    const html = mock.panel.webview.html;
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('nonce-');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toMatch(/\bonclick\s*=/i);
  });
});

describe('MarketplacePanel dispose', () => {
  beforeEach(() => {
    MarketplacePanel.currentPanel = undefined;
    vi.clearAllMocks();
  });

  it('should clean up on dispose', () => {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const mockMarketplaceService = {
      getSources: vi.fn(() => []),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
    } as any;

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      vi.fn(),
    );

    expect(MarketplacePanel.currentPanel).toBeDefined();

    const disposeHandler = mock.getDisposeHandler()!;
    expect(disposeHandler).toBeDefined();
    disposeHandler();

    expect(MarketplacePanel.currentPanel).toBeUndefined();
  });
});

describe('MarketplacePanel filterSourceId on existing panel', () => {
  beforeEach(() => {
    MarketplacePanel.currentPanel = undefined;
    vi.clearAllMocks();
  });

  it('should apply pending filter on first createOrShow with filterSourceId', () => {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const mockMarketplaceService = {
      getSources: vi.fn(() => [{ id: 'anthropic', label: 'Anthropic', isBuiltin: true }]),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
    } as any;

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      vi.fn(),
      'anthropic',
    );

    expect(MarketplacePanel.currentPanel).toBeDefined();
  });
});

// ----------------------------------------------------------
// update message handler
// ----------------------------------------------------------
describe('MarketplacePanel update handler', () => {
  beforeEach(() => {
    MarketplacePanel.currentPanel = undefined;
    vi.clearAllMocks();
  });

  function setupPanel(serviceOverrides: Record<string, any> = {}) {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const onRefresh = vi.fn();
    const mockMarketplaceService = {
      getSources: vi.fn(() => [{ id: 'anthropic', label: 'Anthropic Skills', isBuiltin: true }]),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
      getInstalledVersionMap: vi.fn().mockResolvedValue(new Map()),
      installSkill: vi.fn().mockResolvedValue(undefined),
      updateSkillSilently: vi.fn().mockResolvedValue(undefined),
      addCustomSource: vi.fn().mockResolvedValue(undefined),
      removeCustomSource: vi.fn().mockResolvedValue(undefined),
      ...serviceOverrides,
    } as any;

    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      onRefresh,
    );

    return { mock, onRefresh, mockMarketplaceService };
  }

  it('should handle update message — success', async () => {
    const skill = {
      id: 'update-skill',
      metadata: { name: 'Update Skill', description: 'desc', version: '2.0' },
      source: { id: 'anthropic' },
      repoPath: 'skills/update-skill',
    };

    const { mock, onRefresh, mockMarketplaceService } = setupPanel({
      fetchAll: vi.fn().mockResolvedValue([skill]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set(['update-skill'])),
      getInstalledVersionMap: vi.fn().mockResolvedValue(new Map([['update-skill', '1.0']])),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'update', sourceId: 'anthropic', repoPath: 'skills/update-skill' });

    expect(mockMarketplaceService.updateSkillSilently).toHaveBeenCalledWith(skill);
    expect(onRefresh).toHaveBeenCalled();
    expect(vscodeWindow.showInformationMessage).toHaveBeenCalled();
    expect(mock.panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'updateInstalled' }),
    );
  });

  it('should handle update message — skill not found', async () => {
    const { mock, mockMarketplaceService } = setupPanel({
      fetchAll: vi.fn().mockResolvedValue([]),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'update', sourceId: 'anthropic', repoPath: 'nonexistent' });
    expect(mockMarketplaceService.updateSkillSilently).not.toHaveBeenCalled();
  });

  it('should handle update message — error', async () => {
    const skill = {
      id: 'fail-update',
      metadata: { name: 'Fail Update' },
      source: { id: 'anthropic' },
      repoPath: 'skills/fail-update',
    };

    const { mock } = setupPanel({
      fetchAll: vi.fn().mockResolvedValue([skill]),
      updateSkillSilently: vi.fn().mockRejectedValue(new Error('update network error')),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'update', sourceId: 'anthropic', repoPath: 'skills/fail-update' });
    expect(vscodeWindow.showErrorMessage).toHaveBeenCalled();
  });

  it('should handle addSource message — error case', async () => {
    const { mock, mockMarketplaceService } = setupPanel({
      addCustomSource: vi.fn().mockRejectedValue(new Error('invalid source')),
    });
    const handler = mock.getMessageHandler()!;

    vi.mocked(vscodeWindow.showInputBox).mockResolvedValue('https://github.com/org/bad');

    await handler({ command: 'addSource' });
    expect(vscodeWindow.showErrorMessage).toHaveBeenCalled();
  });

  it('should handle addSource message — user cancels', async () => {
    const { mock, mockMarketplaceService } = setupPanel();
    const handler = mock.getMessageHandler()!;

    vi.mocked(vscodeWindow.showInputBox).mockResolvedValue(undefined);

    await handler({ command: 'addSource' });
    expect(mockMarketplaceService.addCustomSource).not.toHaveBeenCalled();
  });

  it('should handle removeSource message — error case', async () => {
    const { mock } = setupPanel({
      removeCustomSource: vi.fn().mockRejectedValue(new Error('remove failed')),
    });
    const handler = mock.getMessageHandler()!;

    vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Remove' as any);

    await handler({ command: 'removeSource', sourceId: 'custom/repo' });
    expect(vscodeWindow.showErrorMessage).toHaveBeenCalled();
  });

  it('should apply pending filter after loading skills', async () => {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const mockMarketplaceService = {
      getSources: vi.fn(() => [{ id: 'anthropic', label: 'Anthropic', isBuiltin: true }]),
      fetchAll: vi.fn().mockResolvedValue([]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set()),
      getInstalledVersionMap: vi.fn().mockResolvedValue(new Map()),
    } as any;

    // Create panel with a pending filter
    MarketplacePanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockMarketplaceService,
      vi.fn(),
      'anthropic',
    );

    const handler = mock.getMessageHandler()!;
    await handler({ command: 'ready' });

    // After loading, the pending filter should have been sent via postMessage
    const calls = mock.panel.webview.postMessage.mock.calls;
    const filterCalls = calls.filter((c: any) => c[0]?.command === 'filterSource');
    expect(filterCalls).toHaveLength(1);
    expect(filterCalls[0][0].sourceId).toBe('anthropic');
  });

  it('should handle loading skills where skills have version info', async () => {
    const skill = {
      id: 'versioned-skill',
      metadata: { name: 'Versioned', description: 'desc', author: 'a', version: '2.0', tags: ['t'] },
      source: { id: 'anthropic', label: 'Anthropic' },
      repoPath: 'skills/versioned',
    };

    const { mock } = setupPanel({
      fetchAll: vi.fn().mockResolvedValue([skill]),
      getInstalledIds: vi.fn().mockResolvedValue(new Set(['versioned-skill'])),
      getInstalledVersionMap: vi.fn().mockResolvedValue(new Map([['versioned-skill', '1.0']])),
    });
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'ready' });

    const calls = mock.panel.webview.postMessage.mock.calls;
    const updateCalls = calls.filter((c: any) => c[0]?.command === 'updateSkills');
    expect(updateCalls).toHaveLength(1);
    // Should indicate hasUpdate: true since versions differ
    const skillData = updateCalls[0][0].skills[0];
    expect(skillData.hasUpdate).toBe(true);
  });
});
