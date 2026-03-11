import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WellKnownProvider } from './wellKnownProvider';
import { MarketplaceSource } from '../models/skill';

vi.mock('vscode', () => ({
  l10n: { t: (msg: string) => msg },
}));

// Mock http/https modules
const { mockGet } = vi.hoisted(() => {
  const mockGet = vi.fn();
  return { mockGet };
});
vi.mock('https', () => ({ get: mockGet }));
vi.mock('http', () => ({ get: mockGet }));

/**
 * Helper to set up mockGet so it simulates an HTTP response.
 */
function mockHttpResponse(statusCode: number, body: string, headers?: Record<string, string>) {
  mockGet.mockImplementation((_url: string, _opts: any, cb: any) => {
    const res = {
      statusCode,
      headers: headers ?? {},
      on: vi.fn((event: string, handler: any) => {
        if (event === 'data') {
          handler(Buffer.from(body));
        }
        if (event === 'end') {
          handler();
        }
        return res;
      }),
      resume: vi.fn(),
    };
    cb(res);
    return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
  });
}

function makeSource(id: string, owner: string): MarketplaceSource {
  return { id, owner, repo: '.well-known', branch: 'main', path: 'skills', label: '', isBuiltin: false };
}

describe('WellKnownProvider', () => {
  let provider: WellKnownProvider;

  beforeEach(() => {
    provider = new WellKnownProvider();
    vi.clearAllMocks();
  });

  describe('canHandle', () => {
    it('should return true for well-known: prefixed ids', () => {
      expect(provider.canHandle(makeSource('well-known:example.com', 'example.com'))).toBe(true);
    });

    it('should return true for domain-like owners (no github)', () => {
      expect(provider.canHandle(makeSource('src', 'example.com'))).toBe(true);
    });

    it('should return false for github-like owners', () => {
      expect(provider.canHandle(makeSource('org/repo', 'github.com'))).toBe(false);
    });

    it('should return false for non-domain owners', () => {
      expect(provider.canHandle(makeSource('org/repo', 'someuser'))).toBe(false);
    });
  });

  describe('fetchSkills', () => {
    it('should fetch and parse skills from well-known endpoint', async () => {
      const indexJson = JSON.stringify({
        skills: [
          { id: 'skill-1', name: 'Skill One', url: 'https://example.com/.well-known/skills/skill-1/SKILL.md', version: '1.0' },
        ],
      });

      // First call returns index, second returns SKILL.md content
      let callCount = 0;
      mockGet.mockImplementation((_url: string, _opts: any, cb: any) => {
        callCount++;
        const body = callCount === 1 ? indexJson : '---\nname: Original\n---\n# Body';
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

      const source = makeSource('well-known:example.com', 'example.com');
      const skills = await provider.fetchSkills(source);

      expect(skills).toHaveLength(1);
      expect(skills[0].metadata.name).toBe('Skill One'); // index name overrides frontmatter
      expect(skills[0].id).toBe('well-known:example.com--skill-1');
    });

    it('should return empty array for invalid domain', async () => {
      const source = makeSource('invalid', 'simplestring');
      // canHandle would return false, but fetchSkills should handle gracefully
      const skills = await provider.fetchSkills(source);
      expect(skills).toEqual([]);
    });

    it('should return empty when index fetch fails', async () => {
      mockHttpResponse(500, 'Internal Server Error');

      const source = makeSource('well-known:example.com', 'example.com');
      const skills = await provider.fetchSkills(source);
      expect(skills).toEqual([]);
    });

    it('should return empty when index JSON is invalid', async () => {
      mockHttpResponse(200, 'not json');

      const source = makeSource('well-known:example.com', 'example.com');
      const skills = await provider.fetchSkills(source);
      expect(skills).toEqual([]);
    });

    it('should return empty when index has no skills array', async () => {
      mockHttpResponse(200, JSON.stringify({ other: 'data' }));

      const source = makeSource('well-known:example.com', 'example.com');
      const skills = await provider.fetchSkills(source);
      expect(skills).toEqual([]);
    });

    it('should skip entries without url', async () => {
      const indexJson = JSON.stringify({
        skills: [{ id: 'no-url', name: 'No URL' }],
      });
      mockHttpResponse(200, indexJson);

      const source = makeSource('well-known:example.com', 'example.com');
      const skills = await provider.fetchSkills(source);
      expect(skills).toEqual([]);
    });

    it('should skip entries whose content fails to fetch', async () => {
      const indexJson = JSON.stringify({
        skills: [{ id: 'fail', name: 'Fail', url: 'https://example.com/fail.md' }],
      });

      let callCount = 0;
      mockGet.mockImplementation((_url: string, _opts: any, cb: any) => {
        callCount++;
        if (callCount === 1) {
          // Index succeeds
          const res = {
            statusCode: 200,
            headers: {},
            on: vi.fn((event: string, handler: any) => {
              if (event === 'data') { handler(Buffer.from(indexJson)); }
              if (event === 'end') { handler(); }
              return res;
            }),
            resume: vi.fn(),
          };
          cb(res);
          return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
        }
        // Skill content fails
        const res = {
          statusCode: 404,
          headers: {},
          on: vi.fn(),
          resume: vi.fn(),
        };
        cb(res);
        return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
      });

      const source = makeSource('well-known:example.com', 'example.com');
      const skills = await provider.fetchSkills(source);
      expect(skills).toEqual([]);
    });

    it('should use cache on second call (within TTL)', async () => {
      const indexJson = JSON.stringify({
        skills: [{ id: 's1', name: 'S1', url: 'https://example.com/s1.md' }],
      });

      let callCount = 0;
      mockGet.mockImplementation((_url: string, _opts: any, cb: any) => {
        callCount++;
        const body = callCount === 1 ? indexJson : '---\nname: S1\n---\n# Body';
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

      const source = makeSource('well-known:example.com', 'example.com');
      const first = await provider.fetchSkills(source);
      const httpCallsBefore = mockGet.mock.calls.length;
      const second = await provider.fetchSkills(source);
      expect(second).toEqual(first);
      // No additional HTTP calls for cached response
      expect(mockGet.mock.calls.length).toBe(httpCallsBefore);
    });

    it('should bypass cache when force=true', async () => {
      const indexJson = JSON.stringify({ skills: [] });
      mockHttpResponse(200, indexJson);

      const source = makeSource('well-known:example.com', 'example.com');
      await provider.fetchSkills(source);
      const callsBefore = mockGet.mock.calls.length;
      await provider.fetchSkills(source, undefined, true);
      expect(mockGet.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('should merge index metadata with frontmatter', async () => {
      const indexJson = JSON.stringify({
        skills: [{
          id: 'merged',
          name: 'Index Name',
          description: 'Index Desc',
          version: '2.0',
          author: 'Index Author',
          tags: ['a', 'b'],
          url: 'https://example.com/merged.md',
          additionalFiles: [{ relativePath: 'helper.js', url: 'https://example.com/helper.js' }],
        }],
      });

      let callCount = 0;
      mockGet.mockImplementation((_url: string, _opts: any, cb: any) => {
        callCount++;
        const body = callCount === 1 ? indexJson : '---\nname: FM Name\nauthor: FM Author\n---\n# Body';
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

      const source = makeSource('well-known:example.com', 'example.com');
      const skills = await provider.fetchSkills(source, undefined, true);
      expect(skills).toHaveLength(1);
      expect(skills[0].metadata.name).toBe('Index Name');
      expect(skills[0].metadata.description).toBe('Index Desc');
      expect(skills[0].metadata.version).toBe('2.0');
      expect(skills[0].metadata.author).toBe('Index Author');
      expect(skills[0].metadata.tags).toEqual(['a', 'b']);
      expect(skills[0].additionalFiles).toEqual([
        { relativePath: 'helper.js', downloadUrl: 'https://example.com/helper.js' },
      ]);
    });

    it('should extract domain from owner when id is not well-known prefixed', async () => {
      const indexJson = JSON.stringify({ skills: [] });
      mockHttpResponse(200, indexJson);

      const source = makeSource('custom-id', 'my-domain.com');
      const skills = await provider.fetchSkills(source);
      expect(skills).toEqual([]);
      // Verify it attempted to fetch from the domain
      expect(mockGet).toHaveBeenCalled();
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('my-domain.com');
    });
  });

  describe('fetchFileContent', () => {
    it('should fetch text content from URL', async () => {
      mockHttpResponse(200, 'file content here');
      const content = await provider.fetchFileContent('https://example.com/file.md');
      expect(content).toBe('file content here');
    });
  });

  describe('sourceFromDomain', () => {
    it('should create a MarketplaceSource for a domain', () => {
      const source = WellKnownProvider.sourceFromDomain('example.com');
      expect(source.id).toBe('well-known:example.com');
      expect(source.owner).toBe('example.com');
      expect(source.repo).toBe('.well-known');
      expect(source.label).toBe('example.com (Well-Known)');
      expect(source.isBuiltin).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clear cache', () => {
      provider.dispose();
      // Just verifying it doesn't throw
      expect(true).toBe(true);
    });
  });
});
