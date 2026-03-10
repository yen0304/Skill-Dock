import * as vscode from 'vscode';
import * as https from 'https';
import { execFile } from 'child_process';
import { readdir, readFile as fsReadFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, normalize, resolve, sep } from 'path';
import { promisify } from 'util';
import {
  MarketplaceSource,
  RemoteAdditionalFile,
  RemoteSkill,
  BUILTIN_MARKETPLACE_SOURCES,
} from '../models/skill';
import { parseFrontmatter } from '../utils/skillParser';
import { StorageService } from './storageService';

const execFileAsync = promisify(execFile);

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
    const repoFiles = await this._cloneAndReadFiles(source, token);

    const prefix = source.path ? source.path.replace(/\/+$/, '') + '/' : '';
    const allPaths = [...repoFiles.keys()];
    const skillMdPaths = allPaths.filter((p) => {
      const lower = p.toLowerCase();
      const isSkillMd = lower.endsWith('/skill.md') || lower === 'skill.md';
      return isSkillMd && (!prefix || p.startsWith(prefix));
    });

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

      const skillDir = mdPath.substring(0, mdPath.lastIndexOf('/'));
      const additionalFiles: RemoteAdditionalFile[] = skillDir
        ? allPaths
            .filter((p) => p !== mdPath && p.startsWith(skillDir + '/'))
            .map((p) => ({
              relativePath: p.substring(skillDir.length + 1),
              content: repoFiles.get(p),
            }))
        : [];

      const rawUrl = `https://github.com/${source.owner}/${source.repo}`;
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
  // Git clone-based fetching
  // ------------------------------------------------------------------

  /** Clone timeout in ms. */
  private static readonly CLONE_TIMEOUT_MS = 60_000;

  /** Directories to skip when reading a cloned repo. */
  private static readonly SKIP_DIRS = new Set(['.git', 'node_modules', '.DS_Store']);

  /**
   * Clone the repo with `git clone --depth 1` and read all files.
   */
  private async _cloneAndReadFiles(source: MarketplaceSource, token?: string): Promise<Map<string, string>> {
    const url = `https://github.com/${source.owner}/${source.repo}.git`;
    const tmpDir = await mkdtemp(join(tmpdir(), 'skilldock-'));
    try {
      const args = ['clone', '--depth', '1'];
      if (token) {
        args.push('-c', `http.extraHeader=Authorization: token ${token}`);
      }
      if (source.branch) {
        args.push('--branch', source.branch);
      }
      args.push('--', url, tmpDir);

      await execFileAsync('git', args, {
        timeout: MarketplaceService.CLONE_TIMEOUT_MS,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });

      return await MarketplaceService._readDirRecursive(tmpDir);
    } finally {
      await MarketplaceService._cleanupTmpDir(tmpDir);
    }
  }

  /** Recursively read all files from a directory into a Map<relativePath, content>. */
  static async _readDirRecursive(baseDir: string, current = ''): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    const dir = current ? join(baseDir, current) : baseDir;
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (MarketplaceService.SKIP_DIRS.has(entry.name)) { continue; }
      const relPath = current ? `${current}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const sub = await MarketplaceService._readDirRecursive(baseDir, relPath);
        for (const [k, v] of sub) { files.set(k, v); }
      } else if (entry.isFile()) {
        try {
          const content = await fsReadFile(join(baseDir, relPath), 'utf-8');
          files.set(relPath, content);
        } catch {
          // Skip binary files
        }
      }
    }

    return files;
  }

  /** Safely remove a temp directory (only if it's actually under os.tmpdir()). */
  private static async _cleanupTmpDir(dir: string): Promise<void> {
    const normalizedDir = normalize(resolve(dir));
    const normalizedTmp = normalize(resolve(tmpdir()));
    if (!normalizedDir.startsWith(normalizedTmp + sep)) { return; }
    await rm(dir, { recursive: true, force: true }).catch(() => {});
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
