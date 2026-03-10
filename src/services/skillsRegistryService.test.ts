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

vi.mock('https', () => ({ get: vi.fn() }));

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
});
