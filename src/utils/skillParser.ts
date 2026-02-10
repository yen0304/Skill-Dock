import { SkillMetadata } from '../models/skill';

/**
 * Parse YAML frontmatter from a SKILL.md file
 */
export function parseFrontmatter(content: string): { metadata: SkillMetadata; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    // No frontmatter, treat entire content as body
    return {
      metadata: { name: 'untitled', description: '' },
      body: content,
    };
  }

  const yamlStr = match[1];
  const body = match[2];
  const raw = parseSimpleYaml(yamlStr);
  const nested = raw.metadata as Record<string, unknown> | undefined;

  return {
    metadata: {
      name: (raw.name as string) || 'untitled',
      description: (raw.description as string) || '',
      license: raw.license as string | undefined,
      compatibility: raw.compatibility as string | undefined,
      author: (nested?.author as string) || (raw.author as string | undefined),
      version: (nested?.version as string) || (raw.version as string | undefined),
      tags: (raw.tags as string[]) || (nested?.tags as string[] | undefined),
      generatedBy: nested?.generatedBy as string | undefined,
    },
    body,
  };
}

/**
 * Serialize skill metadata and body back to SKILL.md content
 */
export function serializeSkill(metadata: SkillMetadata, body: string): string {
  const lines: string[] = ['---'];

  lines.push(`name: ${metadata.name}`);
  lines.push(`description: ${quoteYamlValue(metadata.description)}`);

  if (metadata.license) {
    lines.push(`license: ${metadata.license}`);
  }
  if (metadata.compatibility) {
    lines.push(`compatibility: ${quoteYamlValue(metadata.compatibility)}`);
  }
  if (metadata.tags && metadata.tags.length > 0) {
    lines.push('tags:');
    for (const tag of metadata.tags) {
      lines.push(`  - ${tag}`);
    }
  }

  // Nested metadata block
  const hasNestedMeta = metadata.author || metadata.version || metadata.generatedBy;
  if (hasNestedMeta) {
    lines.push('metadata:');
    if (metadata.author) {
      lines.push(`  author: ${metadata.author}`);
    }
    if (metadata.version) {
      lines.push(`  version: '${metadata.version}'`);
    }
    if (metadata.generatedBy) {
      lines.push(`  generatedBy: '${metadata.generatedBy}'`);
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(body.trim());
  lines.push('');

  return lines.join('\n');
}

/**
 * Simple YAML parser for frontmatter (handles basic key-value and nested objects)
 */
function parseSimpleYaml(yamlStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yamlStr.split('\n');
  let currentKey = '';
  let currentObject: Record<string, unknown> | null = null;
  let listKey = '';
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length > 0 && listKey) {
      if (currentObject && listKey !== currentKey) {
        // List belongs to a nested key inside the current object
        currentObject[listKey] = listItems;
      } else {
        // List belongs to a top-level key (overwrite the placeholder {})
        result[listKey] = listItems;
        if (listKey === currentKey) {
          currentKey = '';
          currentObject = null;
        }
      }
      listItems = [];
      listKey = '';
    }
  }

  for (const line of lines) {
    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // List item
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();
      listItems.push(value);
      continue;
    }

    // Save previous list
    flushList();

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) { continue; }

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    if (indent >= 2 && currentObject && currentKey) {
      // Nested property
      if (value === '' || value === '|') {
        // Nested key with empty value (might be followed by a list)
        listKey = key;
      } else {
        currentObject[key] = unquote(value);
      }
    } else if (value === '' || value === '|') {
      // Start of nested object, list, or empty value at top level
      if (indent === 0) {
        // If previous key was empty with no nested content, set to empty string
        if (currentKey && currentObject && Object.keys(currentObject).length === 0) {
          result[currentKey] = '';
        }
        currentKey = key;
        currentObject = {};
        result[key] = currentObject;
        // Also check if this is a list parent
        listKey = key;
      }
    } else {
      // Top-level property with a value
      // If previous key was empty with no nested content, set to empty string
      if (currentKey && currentObject && Object.keys(currentObject).length === 0) {
        result[currentKey] = '';
      }
      currentKey = '';
      currentObject = null;
      listKey = key;
      result[key] = unquote(value);
    }
  }

  // Save remaining list
  flushList();

  // If the last key was empty with no nested content, set to empty string
  if (currentKey && currentObject && Object.keys(currentObject).length === 0) {
    result[currentKey] = '';
  }

  return result;
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function quoteYamlValue(value: string): string {
  if (value.includes(':') || value.includes('#') || value.includes('{') ||
      value.includes('}') || value.includes('[') || value.includes(']') ||
      value.includes(',') || value.includes('&') || value.includes('*') ||
      value.includes('?') || value.includes('|') || value.includes('>') ||
      value.includes("'") || value.includes('"') || value.includes('%') ||
      value.includes('@') || value.includes('`')) {
    // Use double quotes and escape internal quotes
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}
