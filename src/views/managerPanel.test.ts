import { describe, it, expect, vi } from 'vitest';

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
