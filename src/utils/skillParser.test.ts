import { describe, it, expect } from 'vitest';
import { parseFrontmatter, serializeSkill } from './skillParser';
import { SkillMetadata } from '../models/skill';

describe('parseFrontmatter', () => {
  it('should parse valid frontmatter with all fields', () => {
    const content = `---
name: My Skill
description: A cool skill
license: MIT
compatibility: claude
tags:
  - workflow
  - ai
metadata:
  author: tester
  version: '1.0'
---

# Hello World
`;
    const result = parseFrontmatter(content);
    expect(result.metadata.name).toBe('My Skill');
    expect(result.metadata.description).toBe('A cool skill');
    expect(result.metadata.license).toBe('MIT');
    expect(result.metadata.compatibility).toBe('claude');
    expect(result.metadata.tags).toEqual(['workflow', 'ai']);
    expect(result.metadata.author).toBe('tester');
    expect(result.metadata.version).toBe('1.0');
    expect(result.body.trim()).toBe('# Hello World');
  });

  it('should return defaults when no frontmatter exists', () => {
    const content = '# Just some markdown\n\nNo frontmatter here.';
    const result = parseFrontmatter(content);
    expect(result.metadata.name).toBe('untitled');
    expect(result.metadata.description).toBe('');
    expect(result.body).toBe(content);
  });

  it('should handle empty description field', () => {
    const content = `---
name: Test
description:
---

Body here
`;
    const result = parseFrontmatter(content);
    expect(result.metadata.name).toBe('Test');
    // BUG: empty value should be empty string '', not an object {}
    // After fix, this should pass
    expect(result.metadata.description).toBe('');
  });

  it('should handle empty body', () => {
    const content = `---
name: Test
description: A test skill
---

`;
    const result = parseFrontmatter(content);
    expect(result.metadata.name).toBe('Test');
    expect(result.metadata.description).toBe('A test skill');
  });

  it('should handle quoted values', () => {
    const content = `---
name: "Quoted Name"
description: 'Single quoted'
---

Body
`;
    const result = parseFrontmatter(content);
    expect(result.metadata.name).toBe('Quoted Name');
    expect(result.metadata.description).toBe('Single quoted');
  });

  it('should handle top-level author/version without nested metadata', () => {
    const content = `---
name: Simple
description: A simple skill
author: direct-author
version: '2.0'
---

Content
`;
    const result = parseFrontmatter(content);
    expect(result.metadata.author).toBe('direct-author');
    expect(result.metadata.version).toBe('2.0');
  });

  it('should handle empty tags list', () => {
    const content = `---
name: NoTags
description: No tags
---

Body
`;
    const result = parseFrontmatter(content);
    expect(result.metadata.tags).toBeUndefined();
  });

  it('should handle empty name field', () => {
    const content = `---
name:
description: Has description
---

Body
`;
    const result = parseFrontmatter(content);
    // Empty name should fallback to 'untitled'
    expect(result.metadata.name).toBe('untitled');
  });
});

describe('serializeSkill', () => {
  it('should serialize a complete skill', () => {
    const metadata: SkillMetadata = {
      name: 'Test Skill',
      description: 'A test description',
      license: 'MIT',
      compatibility: 'claude',
      author: 'tester',
      version: '1.0',
      tags: ['workflow', 'ai'],
    };
    const body = '# Test Content\n\nSome content here.';
    const result = serializeSkill(metadata, body);

    expect(result).toContain('---');
    expect(result).toContain('name: Test Skill');
    expect(result).toContain('description: A test description');
    expect(result).toContain('license: MIT');
    expect(result).toContain('tags:');
    expect(result).toContain('  - workflow');
    expect(result).toContain('  - ai');
    expect(result).toContain('metadata:');
    expect(result).toContain('  author: tester');
    expect(result).toContain("  version: '1.0'");
    expect(result).toContain('# Test Content');
  });

  it('should handle minimal metadata', () => {
    const metadata: SkillMetadata = {
      name: 'Minimal',
      description: '',
    };
    const result = serializeSkill(metadata, '');

    expect(result).toContain('name: Minimal');
    expect(result).toContain('description:');
    expect(result).not.toContain('license:');
    expect(result).not.toContain('tags:');
    expect(result).not.toContain('metadata:');
  });

  it('should quote description with special YAML characters', () => {
    const metadata: SkillMetadata = {
      name: 'Special',
      description: 'Has: colons and # hashes',
    };
    const result = serializeSkill(metadata, 'body');

    expect(result).toContain('description: "Has: colons and # hashes"');
  });

  it('should skip undefined optional fields', () => {
    const metadata: SkillMetadata = {
      name: 'NoOptionals',
      description: 'Basic',
      license: undefined,
      author: undefined,
      version: undefined,
      tags: undefined,
    };
    const result = serializeSkill(metadata, 'body');

    expect(result).not.toContain('license:');
    expect(result).not.toContain('metadata:');
  });

  it('should roundtrip: serialize then parse should preserve data', () => {
    const metadata: SkillMetadata = {
      name: 'Roundtrip',
      description: 'Test roundtrip',
      license: 'MIT',
      author: 'tester',
      version: '1.0',
      tags: ['a', 'b'],
    };
    const body = '# Hello\n\nWorld';

    const serialized = serializeSkill(metadata, body);
    const parsed = parseFrontmatter(serialized);

    expect(parsed.metadata.name).toBe('Roundtrip');
    expect(parsed.metadata.description).toBe('Test roundtrip');
    expect(parsed.metadata.license).toBe('MIT');
    expect(parsed.metadata.author).toBe('tester');
    expect(parsed.metadata.version).toBe('1.0');
    expect(parsed.metadata.tags).toEqual(['a', 'b']);
    expect(parsed.body.trim()).toBe('# Hello\n\nWorld');
  });

  it('should handle empty tags array (not serialized)', () => {
    const metadata: SkillMetadata = {
      name: 'EmptyTags',
      description: 'No tags',
      tags: [],
    };
    const result = serializeSkill(metadata, 'body');
    expect(result).not.toContain('tags:');
  });
});
