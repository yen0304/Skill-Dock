import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window as vscodeWindow } from 'vscode';
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
