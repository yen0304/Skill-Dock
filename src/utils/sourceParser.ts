/**
 * Multi-format source parser for skill repository URLs.
 *
 * Supports:
 * - GitHub shorthand:       owner/repo
 * - GitHub URL:             https://github.com/owner/repo
 * - GitHub URL with branch: https://github.com/owner/repo/tree/branch/path
 * - GitLab URL:             https://gitlab.com/owner/repo
 * - GitLab URL with branch: https://gitlab.com/owner/repo/-/tree/branch/path
 * - Git SSH URL:            git@github.com:owner/repo.git
 * - Local path:             /home/user/skills or ./local-skills
 */

/** Host types recognised by the parser */
export type SourceHost = 'github' | 'gitlab' | 'local' | 'unknown';

/** Parsed result from a source string */
export interface ParsedSource {
  host: SourceHost;
  owner: string;
  repo: string;
  branch: string;
  /** Sub-path inside the repo (empty string if root) */
  path: string;
  /** Canonical display label */
  label: string;
  /** The original raw input */
  raw: string;
  /** Whether the source is a local filesystem path */
  isLocal: boolean;
}

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/** Match full GitHub URL (with optional /tree/branch/path) */
const GITHUB_URL_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/;

/** Match full GitLab URL (with optional /-/tree/branch/path) */
const GITLAB_URL_RE =
  /^https?:\/\/(?:www\.)?gitlab\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/-\/tree\/([^/]+)(?:\/(.+))?)?$/;

/** Match Git SSH URL: git@host:owner/repo.git */
const SSH_RE = /^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/;

/** Match simple shorthand: owner/repo (no slashes beyond the one separator) */
const SHORTHAND_RE = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a source string into a structured object.
 * Returns `null` if the input cannot be parsed.
 */
export function parseSource(input: string): ParsedSource | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) { return null; }

  // 1. GitHub URL
  const ghMatch = trimmed.match(GITHUB_URL_RE);
  if (ghMatch) {
    return buildResult('github', ghMatch[1], ghMatch[2], ghMatch[3], ghMatch[4], trimmed);
  }

  // 2. GitLab URL
  const glMatch = trimmed.match(GITLAB_URL_RE);
  if (glMatch) {
    return buildResult('gitlab', glMatch[1], glMatch[2], glMatch[3], glMatch[4], trimmed);
  }

  // 3. SSH URL
  const sshMatch = trimmed.match(SSH_RE);
  if (sshMatch) {
    const host = sshMatch[1].includes('gitlab') ? 'gitlab' as const : 'github' as const;
    return buildResult(host, sshMatch[2], sshMatch[3], undefined, undefined, trimmed);
  }

  // 4. Shorthand: owner/repo
  const shortMatch = trimmed.match(SHORTHAND_RE);
  if (shortMatch) {
    return buildResult('github', shortMatch[1], shortMatch[2], undefined, undefined, trimmed);
  }

  // 5. Local path (absolute or relative)
  if (trimmed.startsWith('/') || trimmed.startsWith('.') || trimmed.startsWith('~')) {
    return {
      host: 'local',
      owner: '',
      repo: '',
      branch: '',
      path: trimmed,
      label: trimmed,
      raw: trimmed,
      isLocal: true,
    };
  }

  return null;
}

/**
 * Build a raw content download URL for a file in the given source.
 */
export function buildRawUrl(source: ParsedSource, filePath: string): string {
  const subPath = source.path ? `${source.path}/${filePath}` : filePath;

  if (source.host === 'github') {
    return `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.branch}/${subPath}`;
  }
  if (source.host === 'gitlab') {
    return `https://gitlab.com/${source.owner}/${source.repo}/-/raw/${source.branch}/${subPath}`;
  }
  return '';
}

/**
 * Build a tree API URL for the given source.
 */
export function buildTreeApiUrl(source: ParsedSource): string {
  if (source.host === 'github') {
    return `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.branch}?recursive=1`;
  }
  if (source.host === 'gitlab') {
    return `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${source.owner}/${source.repo}`)}/repository/tree?recursive=true&ref=${source.branch}&per_page=100`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildResult(
  host: SourceHost,
  owner: string,
  repo: string,
  branch: string | undefined,
  subpath: string | undefined,
  raw: string,
): ParsedSource {
  const b = branch || 'main';
  const p = subpath?.replace(/\/+$/, '') || '';
  const label = p
    ? `${owner}/${repo}/${p}`
    : `${owner}/${repo}`;

  return { host, owner, repo, branch: b, path: p, label, raw, isLocal: false };
}
