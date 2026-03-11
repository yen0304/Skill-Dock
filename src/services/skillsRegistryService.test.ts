import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillsRegistryService, RegistrySkillEntry } from './skillsRegistryService';
import { MarketplaceService } from './marketplaceService';
import { RemoteSkill, MarketplaceSource } from '../models/skill';

vi.mock('vscode', () => ({
  l10n: {
    t: (msg: string, ...args: unknown[]) => {
      let r = msg;
      args.forEach((a, i) => { r = r.replace(`{${i}}`, String(a)); });
      return r;
    },
  },
  workspace: {
    getConfiguration: () => ({
      get: () => undefined,
    }),
  },
}));

const { mockHttpsGet } = vi.hoisted(() => {
  const mockHttpsGet = vi.fn();
  return { mockHttpsGet };
});
vi.mock('https', () => ({ get: mockHttpsGet }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSource(owner: string, repo: string): MarketplaceSource {
  return {
    id: `${owner}/${repo}`,
    owner,
    repo,
    branch: 'main',
    path: '',
    label: `${owner}/${repo}`,
    isBuiltin: false,
  };
}

function makeRemoteSkill(
  source: MarketplaceSource,
  repoPath: string,
  id: string,
  name: string,
): RemoteSkill {
  return {
    source,
    id,
    metadata: { name, description: '' },
    body: '# Skill',
    repoPath,
    downloadUrl: `https://github.com/${source.owner}/${source.repo}`,
  };
}

function makeRegistryEntry(overrides: Partial<RegistrySkillEntry> = {}): RegistrySkillEntry {
  return {
    id: 'owner/repo/skill-name',
    skillId: 'skill-name',
    name: 'skill-name',
    installs: 100,
    source: 'owner/repo',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SkillsRegistryService', () => {
  let mockMarketplace: MarketplaceService;
  let service: SkillsRegistryService;

  beforeEach(() => {
    mockMarketplace = {
      fetchSource: vi.fn(),
      installSkill: vi.fn(),
    } as unknown as MarketplaceService;
    service = new SkillsRegistryService(mockMarketplace);
  });

  // ---------------------------------------------------------------
  // installFromRegistry – matching logic
  // ---------------------------------------------------------------

  describe('installFromRegistry', () => {
    it('should match by directory name (multi-skill repo)', async () => {
      const source = makeSource('vercel-labs', 'agent-skills');
      const entry = makeRegistryEntry({
        id: 'vercel-labs/agent-skills/react-best-practices',
        skillId: 'react-best-practices',
        name: 'react-best-practices',
        source: 'vercel-labs/agent-skills',
      });

      const remote = makeRemoteSkill(
        source,
        'react-best-practices/SKILL.md',
        'vercel-labs--agent-skills--react-best-practices',
        'React Best Practices',
      );

      vi.mocked(mockMarketplace.fetchSource).mockResolvedValue([remote]);
      vi.mocked(mockMarketplace.installSkill).mockResolvedValue(undefined);

      await service.installFromRegistry(entry);
      expect(mockMarketplace.installSkill).toHaveBeenCalledWith(remote);
    });

    it('should match by id suffix', async () => {
      const source = makeSource('org', 'skills');
      const entry = makeRegistryEntry({
        skillId: 'my-tool',
        source: 'org/skills',
      });

      const remote = makeRemoteSkill(
        source,
        'tools/my-tool/SKILL.md',
        'org--skills--my-tool',
        'My Tool',
      );

      vi.mocked(mockMarketplace.fetchSource).mockResolvedValue([remote]);
      vi.mocked(mockMarketplace.installSkill).mockResolvedValue(undefined);

      await service.installFromRegistry(entry);
      expect(mockMarketplace.installSkill).toHaveBeenCalledWith(remote);
    });

    it('should match root-level SKILL.md by metadata name slug (bug #2)', async () => {
      // Reproduces https://github.com/yen0304/Skill-Dock/issues/2
      // Repo: imxv/pretty-mermaid-skills has SKILL.md at root with name "pretty-mermaid"
      const source = makeSource('imxv', 'pretty-mermaid-skills');
      const entry = makeRegistryEntry({
        id: 'imxv/pretty-mermaid-skills/pretty-mermaid',
        skillId: 'pretty-mermaid',
        name: 'pretty-mermaid',
        source: 'imxv/pretty-mermaid-skills',
      });

      // Root-level SKILL.md -> repoPath is "SKILL.md", dirName = "pretty-mermaid-skills"
      const remote = makeRemoteSkill(
        source,
        'SKILL.md',
        'imxv--pretty-mermaid-skills--pretty-mermaid-skills',
        'pretty-mermaid',
      );

      vi.mocked(mockMarketplace.fetchSource).mockResolvedValue([remote]);
      vi.mocked(mockMarketplace.installSkill).mockResolvedValue(undefined);

      await service.installFromRegistry(entry);
      expect(mockMarketplace.installSkill).toHaveBeenCalledWith(remote);
    });

    it('should fall back to single skill when no name/dir match', async () => {
      const source = makeSource('user', 'my-awesome-skill');
      const entry = makeRegistryEntry({
        skillId: 'something-different',
        name: 'Something Different',
        source: 'user/my-awesome-skill',
      });

      const remote = makeRemoteSkill(
        source,
        'SKILL.md',
        'user--my-awesome-skill--my-awesome-skill',
        'Completely Different Name',
      );

      vi.mocked(mockMarketplace.fetchSource).mockResolvedValue([remote]);
      vi.mocked(mockMarketplace.installSkill).mockResolvedValue(undefined);

      await service.installFromRegistry(entry);
      expect(mockMarketplace.installSkill).toHaveBeenCalledWith(remote);
    });

    it('should throw when no match in multi-skill repo', async () => {
      const source = makeSource('org', 'skills');
      const entry = makeRegistryEntry({
        skillId: 'nonexistent',
        name: 'Nonexistent',
        source: 'org/skills',
      });

      const remoteA = makeRemoteSkill(source, 'skill-a/SKILL.md', 'org--skills--skill-a', 'Skill A');
      const remoteB = makeRemoteSkill(source, 'skill-b/SKILL.md', 'org--skills--skill-b', 'Skill B');

      vi.mocked(mockMarketplace.fetchSource).mockResolvedValue([remoteA, remoteB]);

      await expect(service.installFromRegistry(entry)).rejects.toThrow(
        'Skill "Nonexistent" not found in org/skills'
      );
    });
  });

  // ---------------------------------------------------------------
  // resolveSkill – same matching logic
  // ---------------------------------------------------------------

  describe('resolveSkill', () => {
    it('should resolve root-level SKILL.md by metadata name slug', async () => {
      const source = makeSource('imxv', 'pretty-mermaid-skills');
      const entry = makeRegistryEntry({
        id: 'imxv/pretty-mermaid-skills/pretty-mermaid',
        skillId: 'pretty-mermaid',
        name: 'pretty-mermaid',
        source: 'imxv/pretty-mermaid-skills',
      });

      const remote = makeRemoteSkill(
        source,
        'SKILL.md',
        'imxv--pretty-mermaid-skills--pretty-mermaid-skills',
        'pretty-mermaid',
      );

      vi.mocked(mockMarketplace.fetchSource).mockResolvedValue([remote]);
      const result = await service.resolveSkill(entry);
      expect(result).toBe(remote);
    });

    it('should fall back to single skill in repo', async () => {
      const source = makeSource('user', 'repo');
      const entry = makeRegistryEntry({
        skillId: 'unrelated-name',
        source: 'user/repo',
      });

      const remote = makeRemoteSkill(source, 'SKILL.md', 'user--repo--repo', 'Other Name');

      vi.mocked(mockMarketplace.fetchSource).mockResolvedValue([remote]);
      const result = await service.resolveSkill(entry);
      expect(result).toBe(remote);
    });

    it('should return null for invalid source', async () => {
      const entry = makeRegistryEntry({ source: '' });
      const result = await service.resolveSkill(entry);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // formatInstalls
  // ---------------------------------------------------------------

  describe('formatInstalls', () => {
    it('should format millions', () => {
      expect(SkillsRegistryService.formatInstalls(1_500_000)).toBe('1.5M installs');
      expect(SkillsRegistryService.formatInstalls(2_000_000)).toBe('2M installs');
    });

    it('should format thousands', () => {
      expect(SkillsRegistryService.formatInstalls(854)).toBe('854 installs');
      expect(SkillsRegistryService.formatInstalls(1_200)).toBe('1.2K installs');
    });

    it('should return empty for zero/negative', () => {
      expect(SkillsRegistryService.formatInstalls(0)).toBe('');
      expect(SkillsRegistryService.formatInstalls(-5)).toBe('');
    });

    it('should handle singular', () => {
      expect(SkillsRegistryService.formatInstalls(1)).toBe('1 install');
    });
  });

  // ---------------------------------------------------------------
  // search – via mocked https
  // ---------------------------------------------------------------

  describe('search', () => {
    function mockHttpResponse(statusCode: number, body: string, headers?: Record<string, string>) {
      mockHttpsGet.mockImplementation((_url: string, _opts: any, cb: any) => {
        const res = {
          statusCode,
          headers: headers ?? {},
          on: vi.fn((event: string, handler: any) => {
            if (event === 'data') { handler(Buffer.from(body)); }
            if (event === 'end') { handler(); }
            return res;
          }),
          resume: vi.fn(),
        };
        cb(res);
        return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
      });
    }

    it('should return empty for short query', async () => {
      const result = await service.search('a');
      expect(result.skills).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should return empty for empty query', async () => {
      const result = await service.search('');
      expect(result.skills).toEqual([]);
    });

    it('should fetch and parse search results', async () => {
      const responseBody = JSON.stringify({
        query: 'react',
        skills: [
          { id: 'org/repo/react-skill', skillId: 'react-skill', name: 'React Skill', installs: 500, source: 'org/repo' },
        ],
        count: 1,
      });
      mockHttpResponse(200, responseBody);

      const result = await service.search('react');
      expect(result.query).toBe('react');
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('React Skill');
      expect(result.count).toBe(1);
    });

    it('should throw on HTTP error', async () => {
      mockHttpResponse(500, 'Internal Server Error');

      await expect(service.search('react')).rejects.toThrow('HTTP 500');
    });

    it('should follow redirects', async () => {
      let callCount = 0;
      mockHttpsGet.mockImplementation((_url: string, _opts: any, cb: any) => {
        callCount++;
        if (callCount === 1) {
          // Redirect
          const res = {
            statusCode: 302,
            headers: { location: 'https://skills.sh/api/v2/search' },
            on: vi.fn(),
            resume: vi.fn(),
          };
          cb(res);
          return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
        }
        // Actual response
        const body = JSON.stringify({ query: 'react', skills: [], count: 0 });
        const res = {
          statusCode: 200,
          headers: {},
          on: vi.fn((event: string, handler: any) => {
            if (event === 'data') { handler(Buffer.from(body)); }
            if (event === 'end') { handler(); }
            return res;
          }),
          resume: vi.fn(),
        };
        cb(res);
        return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
      });

      const result = await service.search('react');
      expect(result.count).toBe(0);
      expect(callCount).toBe(2);
    });

    it('should handle timeout', async () => {
      mockHttpsGet.mockImplementation((_url: string, _opts: any, _cb: any) => {
        const req = {
          on: vi.fn((event: string, handler: any) => {
            if (event === 'timeout') {
              handler();
            }
            return req;
          }),
          end: vi.fn(),
          destroy: vi.fn(),
        };
        return req;
      });

      await expect(service.search('react')).rejects.toThrow('timed out');
    });

    it('should handle request error', async () => {
      mockHttpsGet.mockImplementation((_url: string, _opts: any, _cb: any) => {
        const req = {
          on: vi.fn((event: string, handler: any) => {
            if (event === 'error') {
              handler(new Error('ECONNREFUSED'));
            }
            return req;
          }),
          end: vi.fn(),
          destroy: vi.fn(),
        };
        return req;
      });

      await expect(service.search('react')).rejects.toThrow('ECONNREFUSED');
    });
  });

  // ---------------------------------------------------------------
  // installFromRegistry – _parseSource with invalid / GitHub URL
  // ---------------------------------------------------------------

  describe('installFromRegistry – source parsing', () => {
    it('should throw for unparseable source', async () => {
      const entry = makeRegistryEntry({ source: '' });
      await expect(service.installFromRegistry(entry)).rejects.toThrow('Cannot parse skill source');
    });
  });
});
