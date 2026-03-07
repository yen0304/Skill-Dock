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
  /** Number of times the skill has been installed from the marketplace */
  installCount?: number;
  /** Timestamp of the last marketplace install */
  lastInstalledAt?: number;
}

/**
 * Supported target formats for importing skills into repos.
 * Based on the open agent skills ecosystem (https://agentskills.io/).
 */
export type TargetFormat =
  | 'claude'
  | 'cursor'
  | 'codex'
  | 'github'
  | 'github-copilot'
  | 'windsurf'
  | 'cline'
  | 'roo'
  | 'continue'
  | 'augment'
  | 'opencode'
  | 'goose'
  | 'gemini-cli'
  | 'amp'
  | 'kilo'
  | 'junie'
  | 'trae'
  | 'droid'
  | 'kode'
  | 'openhands'
  | 'universal';

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
 * A supporting file bundled alongside a remote skill (e.g. reference.md, scripts/helper.sh).
 */
export interface RemoteAdditionalFile {
  /** Relative path from the skill directory, e.g. "reference.md" or "scripts/helper.sh" */
  relativePath: string;
  /** Raw download URL for the file */
  downloadUrl: string;
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
  /** Additional files bundled in the skill directory (templates, scripts, references, etc.) */
  additionalFiles?: RemoteAdditionalFile[];
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
  {
    id: 'vercel-labs/skills',
    owner: 'vercel-labs',
    repo: 'skills',
    branch: 'main',
    path: 'skills',
    label: 'Vercel Skills (skills.sh)',
    isBuiltin: true,
  },
  {
    id: 'vercel-labs/agent-skills',
    owner: 'vercel-labs',
    repo: 'agent-skills',
    branch: 'main',
    path: '',
    label: 'Vercel Agent Skills',
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
    label: 'Cursor (.agents/skills)',
    description: 'Cursor IDE skill format',
    skillsDir: '.agents/skills',
    usesSkillMd: true,
  },
  codex: {
    id: 'codex',
    label: 'Codex (.agents/skills)',
    description: 'OpenAI Codex skill format',
    skillsDir: '.agents/skills',
    usesSkillMd: true,
  },
  github: {
    id: 'github',
    label: 'GitHub (.github/skills)',
    description: 'GitHub-based skill format',
    skillsDir: '.github/skills',
    usesSkillMd: true,
  },
  'github-copilot': {
    id: 'github-copilot',
    label: 'GitHub Copilot (.agents/skills)',
    description: 'GitHub Copilot agent skills',
    skillsDir: '.agents/skills',
    usesSkillMd: true,
  },
  windsurf: {
    id: 'windsurf',
    label: 'Windsurf (.windsurf/skills)',
    description: 'Windsurf IDE skill format',
    skillsDir: '.windsurf/skills',
    usesSkillMd: true,
  },
  cline: {
    id: 'cline',
    label: 'Cline (.agents/skills)',
    description: 'Cline coding agent skills',
    skillsDir: '.agents/skills',
    usesSkillMd: true,
  },
  roo: {
    id: 'roo',
    label: 'Roo Code (.roo/skills)',
    description: 'Roo Code skill format',
    skillsDir: '.roo/skills',
    usesSkillMd: true,
  },
  continue: {
    id: 'continue',
    label: 'Continue (.continue/skills)',
    description: 'Continue IDE skill format',
    skillsDir: '.continue/skills',
    usesSkillMd: true,
  },
  augment: {
    id: 'augment',
    label: 'Augment (.augment/skills)',
    description: 'Augment coding agent skills',
    skillsDir: '.augment/skills',
    usesSkillMd: true,
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode (.agents/skills)',
    description: 'OpenCode skill format',
    skillsDir: '.agents/skills',
    usesSkillMd: true,
  },
  goose: {
    id: 'goose',
    label: 'Goose (.goose/skills)',
    description: 'Goose coding agent skills',
    skillsDir: '.goose/skills',
    usesSkillMd: true,
  },
  'gemini-cli': {
    id: 'gemini-cli',
    label: 'Gemini CLI (.agents/skills)',
    description: 'Gemini CLI skill format',
    skillsDir: '.agents/skills',
    usesSkillMd: true,
  },
  amp: {
    id: 'amp',
    label: 'Amp (.agents/skills)',
    description: 'Amp skill format',
    skillsDir: '.agents/skills',
    usesSkillMd: true,
  },
  kilo: {
    id: 'kilo',
    label: 'Kilo Code (.kilocode/skills)',
    description: 'Kilo Code skill format',
    skillsDir: '.kilocode/skills',
    usesSkillMd: true,
  },
  junie: {
    id: 'junie',
    label: 'Junie (.junie/skills)',
    description: 'Junie coding agent skills',
    skillsDir: '.junie/skills',
    usesSkillMd: true,
  },
  trae: {
    id: 'trae',
    label: 'Trae (.trae/skills)',
    description: 'Trae IDE skill format',
    skillsDir: '.trae/skills',
    usesSkillMd: true,
  },
  droid: {
    id: 'droid',
    label: 'Droid (.factory/skills)',
    description: 'Factory AI / Droid skill format',
    skillsDir: '.factory/skills',
    usesSkillMd: true,
  },
  kode: {
    id: 'kode',
    label: 'Kode (.kode/skills)',
    description: 'Kode skill format',
    skillsDir: '.kode/skills',
    usesSkillMd: true,
  },
  openhands: {
    id: 'openhands',
    label: 'OpenHands (.openhands/skills)',
    description: 'OpenHands skill format',
    skillsDir: '.openhands/skills',
    usesSkillMd: true,
  },
  universal: {
    id: 'universal',
    label: 'Universal (.agents/skills)',
    description: 'Universal agent skills directory shared by multiple agents',
    skillsDir: '.agents/skills',
    usesSkillMd: true,
  },
};

/**
 * All unique skill directory paths that agents use in repos.
 * Used for scanning workspace skills and file watchers.
 */
export const ALL_SKILL_DIRS: string[] = [
  ...new Set(Object.values(TARGET_FORMATS).map((c) => c.skillsDir)),
];
