import * as https from 'https';
import * as http from 'http';
import { RemoteSkill, MarketplaceSource, RemoteAdditionalFile } from '../models/skill';
import { parseFrontmatter } from '../utils/skillParser';
import { HostProvider } from './hostProvider';

/**
 * Skill entry from a /.well-known/skills/index.json endpoint.
 *
 * Based on the RFC 8615 "well-known" URI convention:
 *   https://example.com/.well-known/skills/index.json
 *
 * Expected JSON shape:
 * ```
 * {
 *   "skills": [
 *     {
 *       "id": "my-skill",
 *       "name": "My Skill",
 *       "description": "...",
 *       "url": "https://example.com/.well-known/skills/my-skill/SKILL.md",
 *       "version": "1.0.0"
 *     }
 *   ]
 * }
 * ```
 */
interface WellKnownEntry {
  id: string;
  name: string;
  description?: string;
  url: string;
  version?: string;
  author?: string;
  tags?: string[];
  additionalFiles?: Array<{ relativePath: string; url: string }>;
}

interface WellKnownIndex {
  skills: WellKnownEntry[];
}

/**
 * Provider that fetches skills from a domain's /.well-known/skills/ endpoint.
 */
export class WellKnownProvider implements HostProvider {
  readonly id = 'well-known';
  readonly label = 'Well-Known Skills';

  private _cache = new Map<string, { skills: RemoteSkill[]; ts: number }>();
  private static CACHE_TTL = 5 * 60 * 1000; // 5 min

  /**
   * Identifies sources whose `id` or `owner` contains a domain-like pattern.
   */
  canHandle(source: MarketplaceSource): boolean {
    // A well-known source has an id starting with "well-known:" or its owner looks like a domain
    return (
      source.id.startsWith('well-known:') ||
      (source.owner.includes('.') && !source.owner.includes('github'))
    );
  }

  async fetchSkills(source: MarketplaceSource, _token?: string, force = false): Promise<RemoteSkill[]> {
    const cacheKey = source.id;
    if (!force) {
      const cached = this._cache.get(cacheKey);
      if (cached && Date.now() - cached.ts < WellKnownProvider.CACHE_TTL) {
        return cached.skills;
      }
    }

    const domain = this.extractDomain(source);
    if (!domain) { return []; }

    const indexUrl = `https://${domain}/.well-known/skills/index.json`;

    let index: WellKnownIndex;
    try {
      const raw = await httpGetText(indexUrl);
      index = JSON.parse(raw) as WellKnownIndex;
    } catch {
      return [];
    }

    if (!index.skills || !Array.isArray(index.skills)) { return []; }

    const skills = await Promise.allSettled(
      index.skills.map((entry) => this.entryToRemoteSkill(source, entry, domain)),
    );

    const result: RemoteSkill[] = [];
    for (const r of skills) {
      if (r.status === 'fulfilled' && r.value) {
        result.push(r.value);
      }
    }

    this._cache.set(cacheKey, { skills: result, ts: Date.now() });
    return result;
  }

  async fetchFileContent(url: string): Promise<string> {
    return httpGetText(url);
  }

  /**
   * Build a MarketplaceSource for a well-known domain.
   */
  static sourceFromDomain(domain: string): MarketplaceSource {
    return {
      id: `well-known:${domain}`,
      owner: domain,
      repo: '.well-known',
      branch: 'main',
      path: 'skills',
      label: `${domain} (Well-Known)`,
      isBuiltin: false,
    };
  }

  dispose(): void {
    this._cache.clear();
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private extractDomain(source: MarketplaceSource): string | null {
    // id format: "well-known:example.com"
    if (source.id.startsWith('well-known:')) {
      return source.id.slice('well-known:'.length);
    }
    // owner that looks like a domain
    if (source.owner.includes('.')) {
      return source.owner;
    }
    return null;
  }

  private async entryToRemoteSkill(
    source: MarketplaceSource,
    entry: WellKnownEntry,
    _domain: string,
  ): Promise<RemoteSkill | null> {
    if (!entry.url) { return null; }

    let content: string;
    try {
      content = await httpGetText(entry.url);
    } catch {
      return null;
    }

    const { metadata, body } = parseFrontmatter(content);

    // Merge index metadata with parsed frontmatter (index takes priority for some fields)
    if (entry.name) { metadata.name = entry.name; }
    if (entry.description) { metadata.description = entry.description; }
    if (entry.version) { metadata.version = entry.version; }
    if (entry.author) { metadata.author = entry.author; }
    if (entry.tags) { metadata.tags = entry.tags; }

    const additionalFiles: RemoteAdditionalFile[] | undefined =
      entry.additionalFiles?.map((f) => ({
        relativePath: f.relativePath,
        downloadUrl: f.url,
      }));

    return {
      source,
      id: `${source.id}--${entry.id}`,
      metadata,
      body,
      repoPath: entry.url,
      downloadUrl: entry.url,
      additionalFiles: additionalFiles && additionalFiles.length > 0 ? additionalFiles : undefined,
    };
  }
}

// ------------------------------------------------------------------
// Simple HTTP helpers
// ------------------------------------------------------------------

const HTTP_TIMEOUT = 15_000;

function httpGetText(url: string): Promise<string> {
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(url, { timeout: HTTP_TIMEOUT, headers: { 'User-Agent': 'SkillDock-VSCode' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGetText(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c as Buffer));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    req.on('error', reject);
    req.end();
  });
}
