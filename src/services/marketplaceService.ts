import * as vscode from 'vscode';
import * as https from 'https';
import {
  MarketplaceSource,
  RemoteAdditionalFile,
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

/**
 * Service for browsing and installing skills from remote GitHub repos.
 */
export class MarketplaceService {
  private _cache = new Map<string, CacheEntry<RemoteSkill[]>>();

  constructor(
    private storageService: StorageService,
    private getToken?: () => Thenable<string | undefined>,
  ) {}

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
    let failedCount = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') {
        skills.push(...r.value);
      } else {
        failedCount++;
        console.warn('[SkillDock] Source fetch failed:', r.reason);
      }
    }
    if (failedCount > 0 && skills.length === 0) {
      const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      const reason = firstError?.reason;
      throw new Error(
        vscode.l10n.t(
          'All {0} source(s) failed to load. {1}',
          String(failedCount),
          reason instanceof Error ? reason.message : String(reason ?? ''),
        )
      );
    }
    return skills;
  }

  async fetchSource(source: MarketplaceSource, force = false): Promise<RemoteSkill[]> {
    if (!force) {
      const cached = this._cache.get(source.id);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const token = await this._resolveToken();
    const { branch, paths } = await this._fetchRepoTree(source, token);

    const prefix = source.path ? source.path.replace(/\/+$/, '') + '/' : '';
    const skillMdPaths = paths.filter((p) => {
      const lower = p.toLowerCase();
      const isSkillMd = lower.endsWith('/skill.md') || lower === 'skill.md';
      return isSkillMd && (!prefix || p.startsWith(prefix));
    });

    // Fetch only the SKILL.md files (small) in parallel; sibling files are
    // referenced lazily by download URL and only fetched at install time.
    const skills = await Promise.all(
      skillMdPaths.map((mdPath) => this._buildRemoteSkill(source, branch, mdPath, paths, token))
    );

    this._cache.set(source.id, { data: skills, timestamp: Date.now() });
    return skills;
  }

  /** Fetch a single SKILL.md and assemble its RemoteSkill (with lazy sibling refs). */
  private async _buildRemoteSkill(
    source: MarketplaceSource,
    branch: string,
    mdPath: string,
    allPaths: string[],
    token?: string,
  ): Promise<RemoteSkill> {
    const content = await this._httpGetText(this._rawUrl(source, branch, mdPath), token);
    const { metadata, body } = parseFrontmatter(content);

    const parts = mdPath.split('/');
    const dirName = parts.length >= 2 ? parts[parts.length - 2] : source.repo;
    if (!metadata.name) {
      const dir = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
      metadata.name = dir.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (!metadata.description) {
      metadata.description = '';
    }

    const skillId = MarketplaceService.makeSkillId(source, dirName);
    const skillDir = mdPath.substring(0, mdPath.lastIndexOf('/'));
    const additionalFiles: RemoteAdditionalFile[] = skillDir
      ? allPaths
          .filter((p) => p !== mdPath && p.startsWith(skillDir + '/'))
          .map((p) => ({
            relativePath: p.substring(skillDir.length + 1),
            downloadUrl: this._rawUrl(source, branch, p),
          }))
      : [];

    return {
      source,
      id: skillId,
      metadata,
      body,
      repoPath: mdPath,
      downloadUrl: `https://github.com/${source.owner}/${source.repo}`,
      additionalFiles: additionalFiles.length > 0 ? additionalFiles : undefined,
    };
  }

  /** Fetch the raw content of a remote file by its download URL. */
  async fetchFileContent(downloadUrl: string): Promise<string> {
    const token = await this._resolveToken();
    return this._httpGetText(downloadUrl, token);
  }

  /** Install a remote skill to the local library. */
  async installSkill(remote: RemoteSkill): Promise<void> {
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
      await this.storageService.createSkill(remote.id, remote.metadata, remote.body);
    }
    const token = await this._resolveToken();
    await this._saveAdditionalFiles(remote, token);
    await this.storageService.recordInstall(remote.id, remote.metadata.version);
  }

  /** Return a map of skillId → installedVersion from the stats file. */
  async getInstalledVersionMap(): Promise<Map<string, string>> {
    return this.storageService.getInstalledVersions();
  }

  /** Update a skill silently (no overwrite dialog) and record the install stat. */
  async updateSkillSilently(remote: RemoteSkill): Promise<void> {
    await this.storageService.updateSkill(remote.id, remote.metadata, remote.body);
    const token = await this._resolveToken();
    await this._saveAdditionalFiles(remote, token);
    await this.storageService.recordInstall(remote.id, remote.metadata.version);
  }

  /** Write all additional files bundled with a remote skill. */
  private async _saveAdditionalFiles(remote: RemoteSkill, token?: string): Promise<void> {
    if (!remote.additionalFiles?.length) { return; }
    await Promise.all(
      remote.additionalFiles.map(async (file) => {
        const content = file.content
          ?? (file.downloadUrl ? await this._httpGetText(file.downloadUrl, token) : '');
        await this.storageService.writeSkillFile(remote.id, file.relativePath, content);
      })
    );
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

  /** Resolve the GitHub token: try SecretStorage callback first, fall back to config. */
  private async _resolveToken(): Promise<string | undefined> {
    if (this.getToken) {
      const t = await this.getToken();
      if (t?.trim()) { return t.trim(); }
    }
    // Fall back to legacy config
    const config = vscode.workspace.getConfiguration('skilldock');
    const legacy = config.get<string>('githubToken');
    return legacy?.trim() || undefined;
  }

  // ------------------------------------------------------------------
  // GitHub trees-API based fetching
  // ------------------------------------------------------------------

  /** GitHub REST API base. */
  private static readonly GITHUB_API = 'https://api.github.com';

  /** raw.githubusercontent.com base for downloading file content. */
  private static readonly RAW_BASE = 'https://raw.githubusercontent.com';

  /** Accept header for GitHub REST API requests. */
  private static readonly GH_ACCEPT = 'application/vnd.github+json';

  /**
   * Fetch the full recursive file tree of a repo via the GitHub trees API.
   *
   * This is dramatically faster than cloning the whole repo: a single API
   * call returns every path, and we then download only the SKILL.md files
   * we actually need (rather than the entire repository, which can be tens
   * of megabytes for sources like github/awesome-copilot).
   *
   * @returns the resolved branch and the list of blob (file) paths.
   */
  private async _fetchRepoTree(
    source: MarketplaceSource,
    token?: string,
  ): Promise<{ branch: string; paths: string[] }> {
    const branch = source.branch || (await this._resolveDefaultBranch(source, token));
    const url =
      `${MarketplaceService.GITHUB_API}/repos/${source.owner}/${source.repo}` +
      `/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const json = await this._httpGetText(url, token, MarketplaceService.GH_ACCEPT);
    const data = JSON.parse(json) as {
      tree?: Array<{ path: string; type: string }>;
      truncated?: boolean;
    };
    if (data.truncated) {
      console.warn(
        `[SkillDock] Tree for ${source.owner}/${source.repo} was truncated; some skills may be missing.`,
      );
    }
    const paths = (data.tree ?? [])
      .filter((e) => e.type === 'blob')
      .map((e) => e.path);
    return { branch, paths };
  }

  /** Resolve a repo's default branch via the GitHub API. */
  private async _resolveDefaultBranch(source: MarketplaceSource, token?: string): Promise<string> {
    const url = `${MarketplaceService.GITHUB_API}/repos/${source.owner}/${source.repo}`;
    const json = await this._httpGetText(url, token, MarketplaceService.GH_ACCEPT);
    const data = JSON.parse(json) as { default_branch?: string };
    return data.default_branch || 'main';
  }

  /** Build a raw.githubusercontent.com URL for a file at a given branch. */
  private _rawUrl(source: MarketplaceSource, branch: string, filePath: string): string {
    return `${MarketplaceService.RAW_BASE}/${source.owner}/${source.repo}/${branch}/${filePath}`;
  }

  // ------------------------------------------------------------------
  // HTTP helpers (using Node https module to avoid type issues)
  // ------------------------------------------------------------------

  /** Return HTTP request headers, optionally including a GitHub token. */
  private _getHeaders(accept?: string, token?: string): Record<string, string> {
    const headers: Record<string, string> = { 'User-Agent': 'SkillDock-VSCode' };
    if (accept) { headers['Accept'] = accept; }
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }
    return headers;
  }

  /** Create an appropriate Error for an HTTP failure, with rate-limit detection. */
  private _httpError(statusCode: number, url: string, rateLimitRemaining?: string | string[]): Error {
    if (statusCode === 403 && rateLimitRemaining === '0') {
      return new Error(vscode.l10n.t(
        'GitHub API rate limit exceeded. Run "Set GitHub Token" command to set a personal access token and increase the limit.'
      ));
    }
    return new Error(`HTTP ${statusCode} for ${url}`);
  }

  /** HTTP request timeout in ms */
  private static readonly HTTP_TIMEOUT_MS = 15_000;

  /** Perform an HTTPS GET and return text. */
  private _httpGetText(url: string, token?: string, accept?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: this._getHeaders(accept, token), timeout: MarketplaceService.HTTP_TIMEOUT_MS }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this._httpGetText(res.headers.location, token, accept).then(resolve, reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(this._httpError(res.statusCode!, url, res.headers['x-ratelimit-remaining']));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      });
      req.on('timeout', () => { req.destroy(); reject(new Error(`Request timed out: ${url}`)); });
      req.on('error', reject);
      req.end();
    });
  }

  // ------------------------------------------------------------------
  // URL parsing
  // ------------------------------------------------------------------

  /**
   * Build a namespaced skill ID from a source and a directory name.
   * This avoids collisions when different repos contain skills with the same dir name.
   *
   * Format: "owner--repo--dirName" or "owner--repo--path--dirName" for sources with sub-paths.
   */
  static makeSkillId(source: MarketplaceSource, dirName: string): string {
    const prefix = source.path
      ? `${source.owner}--${source.repo}--${source.path.replace(/\//g, '--')}`
      : `${source.owner}--${source.repo}`;
    return `${prefix}--${dirName}`;
  }

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
    let branch = '';
    let subpath = '';

    const trimmed = input.trim().replace(/\/+$/, '');

    // Full URL
    const urlMatch = trimmed.match(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/tree\/([^/]+)(?:\/(.+))?)?$/
    );

    if (urlMatch) {
      owner = urlMatch[1];
      repo = urlMatch[2];
      branch = urlMatch[3] || '';
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
