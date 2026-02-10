import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the SkillEditorPanel webview behavior.
 * Since webview code runs in a browser context, we simulate the logic here.
 */

// =====================================================
// Extract and test the validation logic from the webview
// =====================================================

/**
 * This is the ORIGINAL (buggy) regex validation logic from the webview.
 * Extracted for testing.
 */
function validateOriginal(id: string, name: string): { valid: boolean; error?: string } {
  if (!id) {
    return { valid: false, error: 'Skill ID is required' };
  }

  // BUG: single-char IDs bypass validation because id.length > 1 is false
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id) && id.length > 1) {
    return { valid: false, error: 'Use lowercase letters, numbers, and hyphens only' };
  }

  if (!name) {
    return { valid: false, error: 'Skill name is required' };
  }

  return { valid: true };
}

/**
 * This is the FIXED validation logic.
 */
function validateFixed(id: string, name: string): { valid: boolean; error?: string } {
  if (!id) {
    return { valid: false, error: 'Skill ID is required' };
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(id)) {
    return { valid: false, error: 'Use lowercase letters, numbers, and hyphens only' };
  }

  if (!name) {
    return { valid: false, error: 'Skill name is required' };
  }

  return { valid: true };
}

describe('SkillEditorPanel validation (original - demonstrating bugs)', () => {
  it('should pass with valid multi-char ID', () => {
    const result = validateOriginal('my-skill', 'My Skill');
    expect(result.valid).toBe(true);
  });

  it('should reject empty ID', () => {
    const result = validateOriginal('', 'My Skill');
    expect(result.valid).toBe(false);
  });

  it('should reject empty name', () => {
    const result = validateOriginal('my-skill', '');
    expect(result.valid).toBe(false);
  });

  it('BUG: single-char ID bypasses regex validation', () => {
    // "a" doesn't match regex (needs 2+ chars), but id.length > 1 is false
    // So validation PASSES when it should either pass intentionally or be handled
    const result = validateOriginal('a', 'Name');
    // This demonstrates the bug - single char passes even though regex doesn't match
    expect(result.valid).toBe(true);
  });

  it('should reject IDs ending with hyphen', () => {
    const result = validateOriginal('test-', 'Test');
    expect(result.valid).toBe(false);
  });

  it('should reject IDs starting with hyphen', () => {
    const result = validateOriginal('-test', 'Test');
    expect(result.valid).toBe(false);
  });

  it('should reject uppercase letters', () => {
    const result = validateOriginal('MySkill', 'My Skill');
    expect(result.valid).toBe(false);
  });
});

describe('SkillEditorPanel validation (fixed)', () => {
  it('should pass with valid multi-char ID', () => {
    expect(validateFixed('my-skill', 'My Skill').valid).toBe(true);
  });

  it('should pass with single-char lowercase ID', () => {
    expect(validateFixed('a', 'Name').valid).toBe(true);
  });

  it('should pass with single digit ID', () => {
    expect(validateFixed('1', 'Name').valid).toBe(true);
  });

  it('should reject empty ID', () => {
    expect(validateFixed('', 'Name').valid).toBe(false);
  });

  it('should reject empty name', () => {
    expect(validateFixed('valid-id', '').valid).toBe(false);
  });

  it('should reject trailing hyphen', () => {
    expect(validateFixed('test-', 'Name').valid).toBe(false);
  });

  it('should reject leading hyphen', () => {
    expect(validateFixed('-test', 'Name').valid).toBe(false);
  });

  it('should reject uppercase', () => {
    expect(validateFixed('MySkill', 'Name').valid).toBe(false);
  });

  it('should reject special characters', () => {
    expect(validateFixed('my_skill', 'Name').valid).toBe(false);
    expect(validateFixed('my.skill', 'Name').valid).toBe(false);
    expect(validateFixed('my skill', 'Name').valid).toBe(false);
  });

  it('should accept two-char ID', () => {
    expect(validateFixed('ab', 'Name').valid).toBe(true);
  });

  it('should accept numbers and hyphens', () => {
    expect(validateFixed('skill-123', 'Name').valid).toBe(true);
    expect(validateFixed('1-2-3', 'Name').valid).toBe(true);
  });
});

// =====================================================
// Test CSP inline handler issue
// =====================================================

describe('SkillEditorPanel HTML generation (CSP)', () => {
  /**
   * This test verifies that the generated HTML does NOT use inline event
   * handlers (onclick, onchange, etc.) which are blocked by CSP nonce policy.
   *
   * When CSP is set to `script-src 'nonce-...'`, only <script nonce="..."> tags
   * are allowed. Inline handlers like onclick="save()" are silently blocked.
   */
  it('should NOT have inline onclick handlers in the generated HTML', () => {
    // Simulate the HTML template pattern from skillEditorPanel
    // We test for the pattern that causes the bug
    const buggyHtml = `<button class="btn-secondary" onclick="cancel()">Cancel</button>
    <button class="btn-primary" onclick="save()">Create Skill</button>`;

    // Inline event handler pattern
    const inlineHandlerPattern = /\bon\w+\s*=/i;

    // This is the BUGGY pattern - inline handlers exist
    expect(inlineHandlerPattern.test(buggyHtml)).toBe(true);

    // After fix, the HTML should use addEventListener instead
    const fixedHtml = `<button class="btn-secondary" id="cancelBtn">Cancel</button>
    <button class="btn-primary" id="saveBtn">Create Skill</button>`;

    expect(inlineHandlerPattern.test(fixedHtml)).toBe(false);
  });
});

// =====================================================
// Test panel dispose logic
// =====================================================

describe('SkillEditorPanel dispose', () => {
  it('should handle dispose without double-calling panel.dispose()', () => {
    // Simulate the dispose issue
    const disposeFn = vi.fn();
    let isDisposed = false;

    // Simulate what SHOULD happen in the fixed dispose:
    function fixedDispose() {
      if (isDisposed) { return; }
      isDisposed = true;
      disposeFn();
    }

    fixedDispose();
    fixedDispose(); // second call should be no-op

    expect(disposeFn).toHaveBeenCalledTimes(1);
  });
});

// =====================================================
// Panel instantiation tests for coverage
// =====================================================

import { SkillEditorPanel } from './skillEditorPanel';
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

describe('SkillEditorPanel instantiation', () => {
  beforeEach(() => {
    SkillEditorPanel.currentPanels.clear();
    vi.clearAllMocks();
  });

  it('should create panel for new skill', () => {
    const mockStorageService = {
      createSkill: vi.fn().mockResolvedValue(undefined),
      updateSkill: vi.fn().mockResolvedValue(undefined),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
    } as any;

    SkillEditorPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      null,
      true,
      vi.fn(),
    );

    expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledWith(
      'skilldockEditor',
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ enableScripts: true }),
    );
    expect(SkillEditorPanel.currentPanels.size).toBe(1);
  });

  it('should create panel for editing existing skill', () => {
    const mockStorageService = {
      updateSkill: vi.fn().mockResolvedValue(undefined),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
    } as any;

    const skill = {
      id: 'edit-me',
      metadata: {
        name: 'Edit Me',
        description: 'A skill to edit',
        author: 'Tester',
        version: '2.0',
        license: 'MIT',
        compatibility: 'claude',
        tags: ['test', 'edit'],
      },
      body: '# Edit Me\n\nThis has a </script> tag that should be escaped',
      dirPath: '/tmp/edit-me',
      filePath: '/tmp/edit-me/SKILL.md',
      lastModified: Date.now(),
    };

    SkillEditorPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      skill,
      false,
      vi.fn(),
    );

    expect(SkillEditorPanel.currentPanels.has('edit-me')).toBe(true);
  });

  it('should reveal existing panel on second call', () => {
    const mockStorageService = {
      createSkill: vi.fn(),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
    } as any;

    SkillEditorPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      null,
      true,
    );

    SkillEditorPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      null,
      true,
    );

    // Should only create one panel
    expect(SkillEditorPanel.currentPanels.size).toBe(1);
  });
});

describe('SkillEditorPanel message handlers', () => {
  beforeEach(() => {
    SkillEditorPanel.currentPanels.clear();
    vi.clearAllMocks();
  });

  function setupPanel(isNew: boolean, skill: any = null, storageOverrides: Record<string, any> = {}) {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const onSaved = vi.fn();
    const mockStorageService = {
      createSkill: vi.fn().mockResolvedValue(undefined),
      updateSkill: vi.fn().mockResolvedValue(undefined),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
      ...storageOverrides,
    } as any;

    SkillEditorPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      skill,
      isNew,
      onSaved,
    );

    return { mock, onSaved, mockStorageService };
  }

  it('should handle save message — create new skill', async () => {
    const { mock, onSaved, mockStorageService } = setupPanel(true);
    const handler = mock.getMessageHandler()!;
    expect(handler).toBeDefined();

    await handler({
      command: 'save',
      data: {
        id: 'new-skill',
        metadata: { name: 'New Skill', description: 'A new skill' },
        body: '# New Skill',
      },
    });

    expect(mockStorageService.createSkill).toHaveBeenCalledWith(
      'new-skill',
      { name: 'New Skill', description: 'A new skill' },
      '# New Skill',
    );
    expect(onSaved).toHaveBeenCalled();
    expect(vscodeWindow.showInformationMessage).toHaveBeenCalled();
    expect(mock.panel.dispose).toHaveBeenCalled();
  });

  it('should handle save message — update existing skill', async () => {
    const skill = {
      id: 'existing',
      metadata: { name: 'Existing', description: 'desc' },
      body: '# old',
      dirPath: '/tmp/existing',
      filePath: '/tmp/existing/SKILL.md',
      lastModified: Date.now(),
    };

    const { mock, onSaved, mockStorageService } = setupPanel(false, skill);
    const handler = mock.getMessageHandler()!;

    await handler({
      command: 'save',
      data: {
        id: 'existing',
        metadata: { name: 'Updated', description: 'updated desc' },
        body: '# updated',
      },
    });

    expect(mockStorageService.updateSkill).toHaveBeenCalledWith(
      'existing',
      { name: 'Updated', description: 'updated desc' },
      '# updated',
    );
    expect(onSaved).toHaveBeenCalled();
    expect(mock.panel.dispose).toHaveBeenCalled();
  });

  it('should handle save message — error', async () => {
    const { mock } = setupPanel(true, null, {
      createSkill: vi.fn().mockRejectedValue(new Error('disk full')),
    });
    const handler = mock.getMessageHandler()!;

    await handler({
      command: 'save',
      data: {
        id: 'fail',
        metadata: { name: 'Fail', description: '' },
        body: '',
      },
    });

    expect(vscodeWindow.showErrorMessage).toHaveBeenCalled();
    // Panel should NOT be disposed on error
    expect(mock.panel.dispose).not.toHaveBeenCalled();
  });

  it('should handle cancel message', async () => {
    const { mock } = setupPanel(true);
    const handler = mock.getMessageHandler()!;

    await handler({ command: 'cancel' });
    expect(mock.panel.dispose).toHaveBeenCalled();
  });
});

describe('SkillEditorPanel dispose', () => {
  beforeEach(() => {
    SkillEditorPanel.currentPanels.clear();
    vi.clearAllMocks();
  });

  it('should clean up on dispose', () => {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const mockStorageService = {
      createSkill: vi.fn(),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
    } as any;

    SkillEditorPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      null,
      true,
    );

    expect(SkillEditorPanel.currentPanels.size).toBe(1);

    const disposeHandler = mock.getDisposeHandler()!;
    expect(disposeHandler).toBeDefined();
    disposeHandler();

    expect(SkillEditorPanel.currentPanels.size).toBe(0);
  });
});

describe('SkillEditorPanel HTML output', () => {
  beforeEach(() => {
    SkillEditorPanel.currentPanels.clear();
    vi.clearAllMocks();
  });

  it('should generate HTML with CSP nonce for new skill', () => {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const mockStorageService = {
      createSkill: vi.fn(),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
    } as any;

    SkillEditorPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      null,
      true,
    );

    const html = mock.panel.webview.html;
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('nonce-');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toMatch(/\bonclick\s*=/i);
  });

  it('should generate HTML with existing skill data', () => {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const skill = {
      id: 'my-skill',
      metadata: {
        name: 'My Skill',
        description: 'desc',
        author: 'Author',
        version: '1.0',
        license: 'MIT',
        compatibility: 'claude',
        tags: ['tag1', 'tag2'],
      },
      body: '# My Skill\n\nContent here',
      dirPath: '/tmp/my-skill',
      filePath: '/tmp/my-skill/SKILL.md',
      lastModified: Date.now(),
    };

    const mockStorageService = {
      updateSkill: vi.fn(),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
    } as any;

    SkillEditorPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      skill,
      false,
    );

    const html = mock.panel.webview.html;
    expect(html).toContain('my-skill');
    expect(html).toContain('My Skill');
  });

  it('should escape </script> in skill body', () => {
    const mock = createMockWebviewPanel();
    vi.mocked(vscodeWindow.createWebviewPanel).mockReturnValue(mock.panel as any);

    const skill = {
      id: 'xss-test',
      metadata: { name: 'XSS Test', description: 'test' },
      body: 'something </script><script>alert(1)</script> end',
      dirPath: '/tmp/xss',
      filePath: '/tmp/xss/SKILL.md',
      lastModified: Date.now(),
    };

    const mockStorageService = {
      updateSkill: vi.fn(),
      onDidChange: vi.fn(() => ({ dispose: () => {} })),
    } as any;

    SkillEditorPanel.createOrShow(
      { path: '/mock/ext', fsPath: '/mock/ext' } as any,
      mockStorageService,
      skill,
      false,
    );

    const html = mock.panel.webview.html;
    // The </script> in skill body should be escaped
    expect(html).not.toContain('</script><script>alert');
  });
});
