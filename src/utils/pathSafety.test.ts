import { describe, it, expect } from 'vitest';
import { sanitizeName, isPathSafe } from './pathSafety';
import * as path from 'path';

describe('sanitizeName', () => {
  it('should lowercase and keep valid characters', () => {
    expect(sanitizeName('My-Cool_Skill.v1')).toBe('my-cool_skill.v1');
  });

  it('should replace spaces and special characters with hyphens', () => {
    expect(sanitizeName('Hello World!')).toBe('hello-world');
  });

  it('should collapse multiple special characters into a single hyphen', () => {
    expect(sanitizeName('a///b\\\\c')).toBe('a-b-c');
  });

  it('should strip leading/trailing dots and hyphens', () => {
    expect(sanitizeName('---leading')).toBe('leading');
    expect(sanitizeName('trailing...')).toBe('trailing');
    expect(sanitizeName('..hidden')).toBe('hidden');
  });

  it('should prevent path traversal attempts', () => {
    expect(sanitizeName('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeName('../..')).toBe('unnamed-skill');
  });

  it('should return unnamed-skill for empty input', () => {
    expect(sanitizeName('')).toBe('unnamed-skill');
    expect(sanitizeName('...')).toBe('unnamed-skill');
    expect(sanitizeName('---')).toBe('unnamed-skill');
  });

  it('should truncate to 255 characters', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeName(long).length).toBe(255);
  });

  it('should handle unicode characters by replacing them', () => {
    expect(sanitizeName('日本語スキル')).toBe('unnamed-skill');
    expect(sanitizeName('skill-日本語-test')).toBe('skill-test');
  });
});

describe('isPathSafe', () => {
  it('should return true when target is within base', () => {
    expect(isPathSafe('/home/user/skills', '/home/user/skills/my-skill')).toBe(true);
  });

  it('should return true when target equals base', () => {
    expect(isPathSafe('/home/user/skills', '/home/user/skills')).toBe(true);
  });

  it('should return false for path traversal (..)', () => {
    expect(isPathSafe('/home/user/skills', '/home/user/skills/../etc/passwd')).toBe(false);
  });

  it('should return false when target is completely outside base', () => {
    expect(isPathSafe('/home/user/skills', '/tmp/evil')).toBe(false);
  });

  it('should handle relative paths by resolving them', () => {
    const base = path.resolve('test-base');
    const inside = path.resolve('test-base', 'child');
    expect(isPathSafe(base, inside)).toBe(true);
  });

  it('should not be fooled by similar prefixes', () => {
    // /home/user/skills-evil is NOT inside /home/user/skills
    expect(isPathSafe('/home/user/skills', '/home/user/skills-evil')).toBe(false);
  });
});
