import * as vscode from 'vscode';
import * as https from 'https';
import {
  MarketplaceSource,
  RemoteSkill,
  BUILTIN_MARKETPLACE_SOURCES,
} from '../models/skill';
import { parseFrontmatter } from '../utils/skillParser';
import { StorageService } from './storageService';

/** Cache entry with TTL */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** A single item in the GitHub Git Trees API response */
interface GitTreeItem {
  path: string;
  type: string;
}

/** Top-level shape of the GitHub Git Trees API response */
interface GitTreeResponse {
  tree?: GitTreeItem[];
}

/**
 * Service for browsing and installing skills from remote GitHub repos.
 */
export class MarketplaceService {
  private _cache = new Map<string, CacheEntry<RemoteSkill[]>>();

  constructor(private storageService: StorageService) {}

  // ------------------------------------------------------------------
  // Source management
  // ------------------------------------------------------------------

  /** Return all sources (built-in + user-defined). */
  getSources(): MarketplaceSource[] {
    const custom = this.getCustomSourceUrls().map((url) =>
      MarketplaceService.parseGitHubUrl(url)
    ).filter((s): s is MarketplaceSource => s !== null);
    return [...BUILTIN_MARKETPLACE_SOURCES, ...custom];
  }

  /** Return user-defined source URLs from settings. */
  getCustomSourceUrls(): string[] {
    const config = vscode.workspace.getConfiguration('skilldock');
    return config.get<string[]>('marketplaceSources') ?? [];
  }

  /** Add a custom source URL. */
  async addCustomSource(url: string): Promise<void> {
    const parsed = MarketplaceService.parseGitHubUrl(url);
    if (!parsed) {
      throw new Error(vscode.l10n.t('Invalid GitHub URL: {0}', url));
    }
    const urls = [...this.getCustomSourceUrls()];
    if (urls.includes(url)) {
      throw new Error(vscode.l10n.t('Source already exists: {0}', url));
    }
    urls.push(url);
    const config = vscode.workspace.getConfiguration('skilldock');
    await config.update('marketplaceSources', urls, vscode.ConfigurationTarget.Global);
  }

  /** Remove a custom source URL by its id. */
  async removeCustomSource(sourceId: string): Promise<void> {
    const urls = this.getCustomSourceUrls().filter((url) => {
      const parsed = MarketplaceService.parseGitHubUrl(url);
      return parsed?.id !== sourceId;
    });
    const config = vscode.workspace.getConfiguration('skilldock');
    await config.update('marketplaceSources', urls, vscode.ConfigurationTarget.Global);
    this._cache.delete(sourceId);
  }

  // ------------------------------------------------------------------
  // Fetching remote skills
  // ------------------------------------------------------------------

  /** Fetch skills from all sources. */
  async fetchAll(force = false): Promise<RemoteSkill[]> {
    const sources = this.getSources();
    const results = await Promise.allSettled(
      sources.map((src) => this.fetchSource(src, force))
    );
    const skills: RemoteSkill[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        skills.push(...r.value);
      }
    }
    return skills;
  }

  /** Fetch skills from a single source. */
  async fetchSource(source: MarketplaceSource, force = false): Promise<RemoteSkill[]> {
    // Check cache
    if (!force) {
      const cached = this._cache.get(source.id);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    }

    // 1. Get the repository tree
    const treePaths = await this._fetchTree(source);

    // 2. Find SKILL.md files
    const skillMdPaths = treePaths.filter((p) => {
      const lower = p.toLowerCase();
      return lower.endsWith('/skill.md') || lower === 'skill.md';
    });

    // Filter by the source path prefix
    const prefix = source.path ? source.path.replace(/\/+$/, '') + '/' : '';
    const filtered = prefix
      ? skillMdPaths.filter((p) => p.startsWith(prefix))
      : skillMdPaths;

    // 3. Fetch each SKILL.md content
    const results = await Promise.allSettled(
      filtered.map((mdPath) => this._fetchSkillMd(source, mdPath))
    );

    const skills: RemoteSkill[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        skills.push(r.value);
      }
    }

    // Update cache
    this._cache.set(source.id, { data: skills, timestamp: Date.now() });
    return skills;
  }

  /** Install a remote skill to the local library. */
  async installSkill(remote: RemoteSkill): Promise<void> {
    const content = this._rebuildSkillMd(remote);
    const existing = await this.storageService.readSkill(remote.id);
    if (existing) {
      const ans = await vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Skill "{0}" already exists in your library. Overwrite?',
          remote.metadata.name
        ),
        vscode.l10n.t('Overwrite'),
        vscode.l10n.t('Cancel')
      );
      if (ans !== vscode.l10n.t('Overwrite')) {
        return;
      }
      await this.storageService.updateSkill(remote.id, remote.metadata, remote.body);
    } else {
      await this.storageService.createSkill(remote.id, remote.metadata, content);
    }
  }

  /** Check which remote skill IDs are already installed locally. */
  async getInstalledIds(): Promise<Set<string>> {
    const skills = await this.storageService.listSkills();
    return new Set(skills.map((s) => s.id));
  }

  /** Clear the in-memory cache. */
  clearCache(): void {
    this._cache.clear();
  }

  // ------------------------------------------------------------------
  // GitHub API helpers
  // ------------------------------------------------------------------

  /** Fetch the recursive tree listing for a repo. Returns flat file paths. */
  private async _fetchTree(source: MarketplaceSource): Promise<string[]> {
    const url = `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.branch}?recursive=1`;
    const json = await this._httpGetJson(url) as GitTreeResponse;

    if (!json.tree || !Array.isArray(json.tree)) {
      return [];
    }

    return json.tree
      .filter((item) => item.type === 'blob')
      .map((item) => item.path);
  }

  /** Fetch raw content of a SKILL.md and return a RemoteSkill. */
  private async _fetchSkillMd(
    source: MarketplaceSource,
    repoPath: string
  ): Promise<RemoteSkill | null> {
    const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.branch}/${repoPath}`;
    const content = await this._httpGetText(rawUrl);

    const { metadata, body } = parseFrontmatter(content);
    if (!metadata.name) {
      // Derive name from directory
      const parts = repoPath.split('/');
      const dir = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
      metadata.name = dir
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (!metadata.description) {
      metadata.description = '';
    }

    // Derive skill id from directory name
    const parts = repoPath.split('/');
    const dirName = parts.length >= 2 ? parts[parts.length - 2] : source.repo;

    return {
      source,
      id: dirName,
      metadata,
      body,
      repoPath,
      downloadUrl: rawUrl,
    };
  }

  /** Rebuild the full SKILL.md content from metadata + body. */
  private _rebuildSkillMd(remote: RemoteSkill): string {
    const lines: string[] = ['---'];
    if (remote.metadata.name) { lines.push(`name: ${remote.metadata.name}`); }
    if (remote.metadata.description) { lines.push(`description: ${remote.metadata.description}`); }
    if (remote.metadata.author) { lines.push(`author: ${remote.metadata.author}`); }
    if (remote.metadata.version) { lines.push(`version: ${remote.metadata.version}`); }
    if (remote.metadata.license) { lines.push(`license: ${remote.metadata.license}`); }
    if (remote.metadata.tags && remote.metadata.tags.length > 0) {
      lines.push('tags:');
      for (const t of remote.metadata.tags) {
        lines.push(`  - ${t}`);
      }
    }
    lines.push('---');
    lines.push('');
    lines.push(remote.body);
    return lines.join('\n');
  }

  // ------------------------------------------------------------------
  // HTTP helpers (using Node https module to avoid type issues)
  // ------------------------------------------------------------------

  /** Perform an HTTPS GET and return parsed JSON. */
  private _httpGetJson(url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': 'SkillDock-VSCode', Accept: 'application/json' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this._httpGetJson(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
  }

  /** Perform an HTTPS GET and return text. */
  private _httpGetText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': 'SkillDock-VSCode' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this._httpGetText(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
  }

  // ------------------------------------------------------------------
  // URL parsing
  // ------------------------------------------------------------------

  /**
   * Parse a GitHub URL into a MarketplaceSource, or null if invalid.
   *
   * Accepted formats:
   *  - https://github.com/owner/repo
   *  - https://github.com/owner/repo/tree/branch/path
   *  - owner/repo
   */
  static parseGitHubUrl(input: string): MarketplaceSource | null {
    let owner: string;
    let repo: string;
    let branch = 'main';
    let subpath = '';

    const trimmed = input.trim().replace(/\/+$/, '');

    // Full URL
    const urlMatch = trimmed.match(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/tree\/([^/]+)(?:\/(.+))?)?$/
    );

    if (urlMatch) {
      owner = urlMatch[1];
      repo = urlMatch[2];
      branch = urlMatch[3] || 'main';
      subpath = urlMatch[4] || '';
    } else {
      // Short form: owner/repo
      const shortMatch = trimmed.match(/^([^/]+)\/([^/]+)$/);
      if (!shortMatch) { return null; }
      owner = shortMatch[1];
      repo = shortMatch[2];
    }

    const id = subpath
      ? `${owner}/${repo}/${subpath}`
      : `${owner}/${repo}`;

    return {
      id,
      owner,
      repo,
      branch,
      path: subpath,
      label: `${owner}/${repo}${subpath ? '/' + subpath : ''}`,
      isBuiltin: false,
    };
  }
}
