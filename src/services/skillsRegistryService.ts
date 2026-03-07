import * as https from 'https';
import * as vscode from 'vscode';
import { MarketplaceSource, RemoteSkill } from '../models/skill';
import { MarketplaceService } from './marketplaceService';

/**
 * A skill entry returned by the skills.sh search API.
 */
export interface RegistrySkillEntry {
  /** Full unique ID, e.g. "vercel-labs/agent-skills/vercel-react-best-practices" */
  id: string;
  /** Skill directory name, e.g. "vercel-react-best-practices" */
  skillId: string;
  /** Human-readable skill name */
  name: string;
  /** Total installs from the ecosystem */
  installs: number;
  /** Source repo identifier, e.g. "vercel-labs/agent-skills" */
  source: string;
}

export interface RegistrySearchResult {
  query: string;
  skills: RegistrySkillEntry[];
  count: number;
}

/**
 * Service for searching the open agent skills ecosystem via skills.sh API.
 *
 * This integrates the skill discovery from https://skills.sh (the same backend
 * used by `npx skills find`) directly into Skill Dock's VS Code UI, allowing
 * users to search the entire ecosystem and install skills to their global library.
 */
export class SkillsRegistryService {
  private static readonly API_BASE = 'https://skills.sh';
  private static readonly HTTP_TIMEOUT_MS = 15_000;

  constructor(
    private marketplaceService: MarketplaceService,
  ) {}

  /**
   * Search for skills by keyword via the skills.sh API.
   *
   * @param query  Search query (min 2 chars)
   * @param limit  Max results to return (default 20)
   */
  async search(query: string, limit = 20): Promise<RegistrySearchResult> {
    if (!query || query.length < 2) {
      return { query, skills: [], count: 0 };
    }

    const url = `${SkillsRegistryService.API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const raw = await this._httpGetJson<{
      query: string;
      skills: Array<{
        id: string;
        skillId: string;
        name: string;
        installs: number;
        source: string;
      }>;
      count: number;
    }>(url);

    return {
      query: raw.query,
      skills: raw.skills.map((s) => ({
        id: s.id,
        skillId: s.skillId,
        name: s.name,
        installs: s.installs,
        source: s.source,
      })),
      count: raw.count,
    };
  }

  /**
   * Install a skill discovered via skills.sh into the user's global library.
   *
   * Flow:
   *  1. Parse the `source` field to build a temporary MarketplaceSource
   *  2. Fetch skills from that source (uses tarball download, cached)
   *  3. Match the specific skill by its directory name
   *  4. Install via MarketplaceService
   */
  async installFromRegistry(entry: RegistrySkillEntry): Promise<void> {
    const source = this._parseSource(entry.source);
    if (!source) {
      throw new Error(
        vscode.l10n.t('Cannot parse skill source: {0}', entry.source),
      );
    }

    // Fetch skills from the source repo
    const remoteSkills = await this.marketplaceService.fetchSource(source, false);

    // Find the matching skill by directory name
    const match = remoteSkills.find((s) => {
      // Match by the directory portion of the repoPath
      const parts = s.repoPath.split('/');
      const dirName = parts.length >= 2 ? parts[parts.length - 2] : '';
      return dirName === entry.skillId || s.id.endsWith(`--${entry.skillId}`);
    });

    if (!match) {
      throw new Error(
        vscode.l10n.t(
          'Skill "{0}" not found in {1}. It may have been removed or renamed.',
          entry.name,
          entry.source,
        ),
      );
    }

    await this.marketplaceService.installSkill(match);
  }

  /**
   * Fetch the full RemoteSkill object for a registry entry.
   * Returns null if the skill cannot be resolved.
   */
  async resolveSkill(entry: RegistrySkillEntry): Promise<RemoteSkill | null> {
    const source = this._parseSource(entry.source);
    if (!source) { return null; }

    const remoteSkills = await this.marketplaceService.fetchSource(source, false);

    return remoteSkills.find((s) => {
      const parts = s.repoPath.split('/');
      const dirName = parts.length >= 2 ? parts[parts.length - 2] : '';
      return dirName === entry.skillId || s.id.endsWith(`--${entry.skillId}`);
    }) ?? null;
  }

  /**
   * Format an install count for display (e.g. "180K installs").
   */
  static formatInstalls(count: number): string {
    if (!count || count <= 0) { return ''; }
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M installs`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K installs`;
    }
    return `${count} install${count === 1 ? '' : 's'}`;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Parse a skills.sh source string (e.g. "vercel-labs/agent-skills")
   * into a MarketplaceSource for the existing marketplace fetch pipeline.
   */
  private _parseSource(source: string): MarketplaceSource | null {
    // The source from skills.sh is in "owner/repo" format
    const match = source.match(/^([^/]+)\/([^/]+)$/);
    if (!match) {
      return MarketplaceService.parseGitHubUrl(source);
    }

    const [, owner, repo] = match;
    return {
      id: `${owner}/${repo}`,
      owner: owner!,
      repo: repo!,
      branch: 'main',
      path: '',
      label: `${owner}/${repo}`,
      isBuiltin: false,
    };
  }

  /** Perform an HTTPS GET and parse JSON. */
  private _httpGetJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: { 'User-Agent': 'SkillDock-VSCode' },
          timeout: SkillsRegistryService.HTTP_TIMEOUT_MS,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            this._httpGetJson<T>(res.headers.location).then(resolve, reject);
            return;
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            res.resume();
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            try {
              const text = Buffer.concat(chunks).toString('utf-8');
              resolve(JSON.parse(text) as T);
            } catch (err) {
              reject(err);
            }
          });
          res.on('error', reject);
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out: ${url}`));
      });
      req.on('error', reject);
      req.end();
    });
  }
}
