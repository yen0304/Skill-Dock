/**
 * Core Skill data model
 */
export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  author?: string;
  version?: string;
  tags?: string[];
  generatedBy?: string;
  [key: string]: unknown;
}

export interface Skill {
  /** Unique ID (directory name) */
  id: string;
  /** Parsed frontmatter metadata */
  metadata: SkillMetadata;
  /** Raw markdown body (after frontmatter) */
  body: string;
  /** Absolute path to the skill directory */
  dirPath: string;
  /** Absolute path to SKILL.md */
  filePath: string;
  /** Timestamp of last modification */
  lastModified: number;
  /** Optional: additional files in the skill directory */
  additionalFiles?: string[];
}

/**
 * Supported target formats for importing skills into repos
 */
export type TargetFormat = 'claude' | 'cursor' | 'codex' | 'github';

export interface TargetFormatConfig {
  id: TargetFormat;
  label: string;
  description: string;
  /** Path pattern relative to workspace root */
  skillsDir: string;
  /** Whether to use SKILL.md (all do currently) */
  usesSkillMd: boolean;
  /** Additional files/dirs to create */
  scaffoldDirs?: string[];
}

/**
 * Marketplace source — a GitHub repo (or sub-folder) that hosts skills.
 */
export interface MarketplaceSource {
  /** Unique key, e.g. "anthropics/skills" */
  id: string;
  /** GitHub owner */
  owner: string;
  /** GitHub repo name */
  repo: string;
  /** Branch (defaults to "main") */
  branch: string;
  /** Sub-path inside the repo to scan (empty = root) */
  path: string;
  /** Display label */
  label: string;
  /** Whether this source ships with the extension */
  isBuiltin: boolean;
}

/**
 * A skill discovered from a remote marketplace source.
 */
export interface RemoteSkill {
  /** Source it was found in */
  source: MarketplaceSource;
  /** Directory name in the remote repo */
  id: string;
  /** Parsed frontmatter from SKILL.md */
  metadata: SkillMetadata;
  /** Markdown body */
  body: string;
  /** Full path inside the repo (e.g. "skills/my-skill/SKILL.md") */
  repoPath: string;
  /** Raw download URL */
  downloadUrl: string;
}

/**
 * Built-in marketplace sources that ship with the extension.
 */
export const BUILTIN_MARKETPLACE_SOURCES: MarketplaceSource[] = [
  {
    id: 'anthropics/skills',
    owner: 'anthropics',
    repo: 'skills',
    branch: 'main',
    path: '',
    label: 'Anthropic Skills',
    isBuiltin: true,
  },
  {
    id: 'openai/skills',
    owner: 'openai',
    repo: 'skills',
    branch: 'main',
    path: '',
    label: 'OpenAI Skills',
    isBuiltin: true,
  },
  {
    id: 'github/awesome-copilot/skills',
    owner: 'github',
    repo: 'awesome-copilot',
    branch: 'main',
    path: 'skills',
    label: 'GitHub Copilot Skills',
    isBuiltin: true,
  },
];

export const TARGET_FORMATS: Record<TargetFormat, TargetFormatConfig> = {
  claude: {
    id: 'claude',
    label: 'Claude (.claude/skills)',
    description: 'Claude Code / Claude Desktop skill format',
    skillsDir: '.claude/skills',
    usesSkillMd: true,
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor (.cursor/skills)',
    description: 'Cursor IDE skill format',
    skillsDir: '.cursor/skills',
    usesSkillMd: true,
  },
  codex: {
    id: 'codex',
    label: 'Codex (.codex/skills)',
    description: 'OpenAI Codex skill format with optional scripts/references',
    skillsDir: '.codex/skills',
    usesSkillMd: true,
    scaffoldDirs: ['agents', 'scripts', 'references', 'assets'],
  },
  github: {
    id: 'github',
    label: 'GitHub (.github/skills)',
    description: 'GitHub-based skill format',
    skillsDir: '.github/skills',
    usesSkillMd: true,
  },
};
