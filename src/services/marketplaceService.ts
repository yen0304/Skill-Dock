import * as vscode from 'vscode';
import * as https from 'https';
import * as zlib from 'zlib';
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

  /**
   * Fetch skills from a single source.
   *
   * Downloads the entire repository as a tar.gz archive in a single HTTP
   * request, then parses all SKILL.md files from the in-memory archive.
   * This is dramatically faster than fetching each file individually.
   */
  async fetchSource(source: MarketplaceSource, force = false): Promise<RemoteSkill[]> {
    // Check cache
    if (!force) {
      const cached = this._cache.get(source.id);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const token = await this._resolveToken();

    // Download the entire repo as a tarball (single HTTP request)
    const repoFiles = await this._fetchArchive(source, token);

    // Find SKILL.md files, respecting the source path prefix
    const prefix = source.path ? source.path.replace(/\/+$/, '') + '/' : '';
    const allPaths = [...repoFiles.keys()];
    const skillMdPaths = allPaths.filter((p) => {
      const lower = p.toLowerCase();
      const isSkillMd = lower.endsWith('/skill.md') || lower === 'skill.md';
      return isSkillMd && (!prefix || p.startsWith(prefix));
    });

    // Parse each SKILL.md from the in-memory archive (no additional HTTP calls)
    const skills: RemoteSkill[] = [];
    for (const mdPath of skillMdPaths) {
      const content = repoFiles.get(mdPath);
      if (!content) { continue; }

      const { metadata, body } = parseFrontmatter(content);
      if (!metadata.name) {
        const parts = mdPath.split('/');
        const dir = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
        metadata.name = dir
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
      if (!metadata.description) {
        metadata.description = '';
      }

      const parts = mdPath.split('/');
      const dirName = parts.length >= 2 ? parts[parts.length - 2] : source.repo;
      const skillId = MarketplaceService.makeSkillId(source, dirName);

      // Collect sibling files in the same skill directory
      const skillDir = mdPath.substring(0, mdPath.lastIndexOf('/'));
      const additionalFiles: RemoteAdditionalFile[] = skillDir
        ? allPaths
            .filter((p) => p !== mdPath && p.startsWith(skillDir + '/'))
            .map((p) => ({
              relativePath: p.substring(skillDir.length + 1),
              downloadUrl: `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.branch}/${p}`,
            }))
        : [];

      const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.branch}/${mdPath}`;
      skills.push({
        source,
        id: skillId,
        metadata,
        body,
        repoPath: mdPath,
        downloadUrl: rawUrl,
        additionalFiles: additionalFiles.length > 0 ? additionalFiles : undefined,
      });
    }

    this._cache.set(source.id, { data: skills, timestamp: Date.now() });
    return skills;
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

  /** Download and write all additional files bundled with a remote skill. */
  private async _saveAdditionalFiles(remote: RemoteSkill, token?: string): Promise<void> {
    if (!remote.additionalFiles?.length) { return; }
    await Promise.all(
      remote.additionalFiles.map(async (file) => {
        const content = await this._httpGetText(file.downloadUrl, token);
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
    // Migration fallback: read from config if SecretStorage callback not provided or returned empty
    const config = vscode.workspace.getConfiguration('skilldock');
    const legacy = config.get<string>('githubToken');
    return legacy?.trim() || undefined;
  }

  // ------------------------------------------------------------------
  // Archive-based fetching (single HTTP request per source)
  // ------------------------------------------------------------------

  /** Download the repo as a tar.gz archive and extract file contents. */
  private async _fetchArchive(source: MarketplaceSource, token?: string): Promise<Map<string, string>> {
    const url = `https://codeload.github.com/${source.owner}/${source.repo}/tar.gz/refs/heads/${source.branch}`;
    const compressed = await this._httpGetBuffer(url, token);
    const decompressed = zlib.gunzipSync(compressed);
    const files = MarketplaceService.parseTar(decompressed);
    return files;
  }

  /**
   * Parse a tar buffer and return a map of relative-path → UTF-8 content.
   * Strips the root directory that GitHub adds to archive entries.
   */
  static parseTar(buffer: Buffer): Map<string, string> {
    const files = new Map<string, string>();
    let offset = 0;
    let pendingPath: string | null = null;

    while (offset + 512 <= buffer.length) {
      const header = buffer.subarray(offset, offset + 512);
      if (header[0] === 0) { break; } // end-of-archive

      // Name (bytes 0–99) + optional UStar prefix (bytes 345–499)
      let name = header.subarray(0, 100).toString('utf-8').replace(/\0+$/, '');
      const ustarPrefix = header.subarray(345, 500).toString('utf-8').replace(/\0+$/, '');
      if (ustarPrefix) { name = ustarPrefix + '/' + name; }

      // Size in octal (bytes 124–135)
      const size = parseInt(
        header.subarray(124, 136).toString('utf-8').replace(/\0+$/, '').trim(),
        8,
      ) || 0;

      // Type flag (byte 156)
      const type = String.fromCharCode(header[156]);

      offset += 512; // advance past header

      if (type === 'L') {
        // GNU long-name extension
        pendingPath = buffer.subarray(offset, offset + size).toString('utf-8').replace(/\0+$/, '');
      } else if (type === 'x' || type === 'g') {
        // pax extended header — look for path=
        const pax = buffer.subarray(offset, offset + size).toString('utf-8');
        const m = pax.match(/\d+ path=(.+)\n/);
        if (m) { pendingPath = m[1]; }
      } else {
        const finalName = pendingPath || name;
        pendingPath = null;
        if ((type === '0' || type === '' || type === '\0') && size > 0) {
          // Regular file — strip the root directory GitHub adds (e.g. "repo-sha/")
          const slash = finalName.indexOf('/');
          const rel = slash >= 0 ? finalName.substring(slash + 1) : finalName;
          if (rel) {
            files.set(rel, buffer.subarray(offset, offset + size).toString('utf-8'));
          }
        }
      }

      // Data blocks are aligned to 512-byte boundaries
      offset += Math.ceil(size / 512) * 512;
    }

    return files;
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

  /** Longer timeout for archive downloads (full repo tarball) */
  private static readonly ARCHIVE_TIMEOUT_MS = 30_000;

  /** Perform an HTTPS GET and return a raw Buffer (used for archive downloads). */
  private _httpGetBuffer(url: string, token?: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: this._getHeaders(undefined, token), timeout: MarketplaceService.ARCHIVE_TIMEOUT_MS }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this._httpGetBuffer(res.headers.location, token).then(resolve, reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(this._httpError(res.statusCode!, url, res.headers['x-ratelimit-remaining']));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      req.on('timeout', () => { req.destroy(); reject(new Error(`Request timed out: ${url}`)); });
      req.on('error', reject);
      req.end();
    });
  }

  /** Perform an HTTPS GET and return text. */
  private _httpGetText(url: string, token?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: this._getHeaders(undefined, token), timeout: MarketplaceService.HTTP_TIMEOUT_MS }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this._httpGetText(res.headers.location, token).then(resolve, reject);
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
