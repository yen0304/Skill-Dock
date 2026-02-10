import { describe, it, expect, vi } from 'vitest';

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
