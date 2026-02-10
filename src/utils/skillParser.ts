import YAML from 'yaml';
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

  let raw: Record<string, unknown>;
  try {
    raw = YAML.parse(yamlStr) ?? {};
  } catch {
    // Fallback: treat everything as body if YAML is broken
    return {
      metadata: { name: 'untitled', description: '' },
      body: content,
    };
  }

  const nested = raw.metadata as Record<string, unknown> | undefined;

  return {
    metadata: {
      name: stringVal(raw.name) || 'untitled',
      description: stringVal(raw.description) || '',
      license: stringVal(raw.license),
      compatibility: stringVal(raw.compatibility),
      author: stringVal(nested?.author) || stringVal(raw.author),
      version: stringVal(nested?.version) || stringVal(raw.version),
      tags: asStringArray(raw.tags) || asStringArray(nested?.tags),
      generatedBy: stringVal(nested?.generatedBy),
    },
    body,
  };
}

/**
 * Serialize skill metadata and body back to SKILL.md content
 */
export function serializeSkill(metadata: SkillMetadata, body: string): string {
  // Build a plain object to serialise via the yaml library
  const doc: Record<string, unknown> = {};

  doc.name = metadata.name;
  doc.description = metadata.description;

  if (metadata.license) {
    doc.license = metadata.license;
  }
  if (metadata.compatibility) {
    doc.compatibility = metadata.compatibility;
  }
  if (metadata.tags && metadata.tags.length > 0) {
    doc.tags = metadata.tags;
  }

  // Nested metadata block
  const nested: Record<string, unknown> = {};
  if (metadata.author) { nested.author = metadata.author; }
  if (metadata.version) { nested.version = String(metadata.version); }
  if (metadata.generatedBy) { nested.generatedBy = String(metadata.generatedBy); }
  if (Object.keys(nested).length > 0) {
    doc.metadata = nested;
  }

  const yamlStr = YAML.stringify(doc, { lineWidth: 0 }).trimEnd();

  return `---\n${yamlStr}\n---\n\n${body.trim()}\n`;
}

// ---- helpers ----

function stringVal(v: unknown): string | undefined {
  if (v === null || v === undefined) { return undefined; }
  if (typeof v === 'string') { return v; }
  return String(v);
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) { return undefined; }
  return v.map(String);
}
