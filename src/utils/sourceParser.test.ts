import { describe, it, expect } from 'vitest';
import { parseSource, buildRawUrl, buildTreeApiUrl } from './sourceParser';

describe('parseSource', () => {
  // ------------------------------------------------------------------
  // GitHub URLs
  // ------------------------------------------------------------------
  describe('GitHub URLs', () => {
    it('should parse full GitHub URL', () => {
      const result = parseSource('https://github.com/anthropics/skills');
      expect(result).not.toBeNull();
      expect(result!.host).toBe('github');
      expect(result!.owner).toBe('anthropics');
      expect(result!.repo).toBe('skills');
      expect(result!.branch).toBe('main');
      expect(result!.path).toBe('');
      expect(result!.isLocal).toBe(false);
    });

    it('should parse GitHub URL with branch', () => {
      const result = parseSource('https://github.com/owner/repo/tree/develop');
      expect(result!.branch).toBe('develop');
      expect(result!.path).toBe('');
    });

    it('should parse GitHub URL with branch and path', () => {
      const result = parseSource('https://github.com/owner/repo/tree/main/skills/sub');
      expect(result!.branch).toBe('main');
      expect(result!.path).toBe('skills/sub');
    });

    it('should parse GitHub URL with .git suffix', () => {
      const result = parseSource('https://github.com/owner/repo.git');
      expect(result!.owner).toBe('owner');
      expect(result!.repo).toBe('repo');
    });

    it('should handle trailing slashes', () => {
      const result = parseSource('https://github.com/owner/repo/');
      expect(result!.owner).toBe('owner');
      expect(result!.repo).toBe('repo');
    });
  });

  // ------------------------------------------------------------------
  // GitLab URLs
  // ------------------------------------------------------------------
  describe('GitLab URLs', () => {
    it('should parse full GitLab URL', () => {
      const result = parseSource('https://gitlab.com/group/project');
      expect(result!.host).toBe('gitlab');
      expect(result!.owner).toBe('group');
      expect(result!.repo).toBe('project');
      expect(result!.branch).toBe('main');
    });

    it('should parse GitLab URL with branch', () => {
      const result = parseSource('https://gitlab.com/group/project/-/tree/develop');
      expect(result!.branch).toBe('develop');
    });

    it('should parse GitLab URL with branch and path', () => {
      const result = parseSource('https://gitlab.com/group/project/-/tree/main/skills');
      expect(result!.branch).toBe('main');
      expect(result!.path).toBe('skills');
    });
  });

  // ------------------------------------------------------------------
  // SSH URLs
  // ------------------------------------------------------------------
  describe('SSH URLs', () => {
    it('should parse GitHub SSH URL', () => {
      const result = parseSource('git@github.com:owner/repo.git');
      expect(result!.host).toBe('github');
      expect(result!.owner).toBe('owner');
      expect(result!.repo).toBe('repo');
    });

    it('should parse GitLab SSH URL', () => {
      const result = parseSource('git@gitlab.com:group/project.git');
      expect(result!.host).toBe('gitlab');
      expect(result!.owner).toBe('group');
      expect(result!.repo).toBe('project');
    });

    it('should parse SSH URL without .git suffix', () => {
      const result = parseSource('git@github.com:owner/repo');
      expect(result!.owner).toBe('owner');
      expect(result!.repo).toBe('repo');
    });
  });

  // ------------------------------------------------------------------
  // Shorthand
  // ------------------------------------------------------------------
  describe('Shorthand', () => {
    it('should parse owner/repo shorthand', () => {
      const result = parseSource('anthropics/skills');
      expect(result!.host).toBe('github');
      expect(result!.owner).toBe('anthropics');
      expect(result!.repo).toBe('skills');
    });

    it('should handle names with dots and hyphens', () => {
      const result = parseSource('my-org/my-skills.io');
      expect(result!.owner).toBe('my-org');
      expect(result!.repo).toBe('my-skills.io');
    });
  });

  // ------------------------------------------------------------------
  // Local paths
  // ------------------------------------------------------------------
  describe('Local paths', () => {
    it('should parse absolute paths', () => {
      const result = parseSource('/home/user/skills');
      expect(result!.host).toBe('local');
      expect(result!.isLocal).toBe(true);
      expect(result!.path).toBe('/home/user/skills');
    });

    it('should parse relative paths starting with dot', () => {
      const result = parseSource('./local-skills');
      expect(result!.host).toBe('local');
      expect(result!.isLocal).toBe(true);
    });

    it('should parse home-relative paths', () => {
      const result = parseSource('~/skills');
      expect(result!.host).toBe('local');
      expect(result!.isLocal).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // Edge cases
  // ------------------------------------------------------------------
  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(parseSource('')).toBeNull();
    });

    it('should return null for whitespace', () => {
      expect(parseSource('   ')).toBeNull();
    });

    it('should return null for invalid input', () => {
      expect(parseSource('not a valid source')).toBeNull();
    });

    it('should trim whitespace from input', () => {
      const result = parseSource('  anthropics/skills  ');
      expect(result!.owner).toBe('anthropics');
    });
  });
});

describe('buildRawUrl', () => {
  it('should build GitHub raw URL', () => {
    const src = parseSource('anthropics/skills')!;
    expect(buildRawUrl(src, 'my-skill/SKILL.md')).toBe(
      'https://raw.githubusercontent.com/anthropics/skills/main/my-skill/SKILL.md'
    );
  });

  it('should include sub-path in URL', () => {
    const src = parseSource('https://github.com/owner/repo/tree/main/skills')!;
    expect(buildRawUrl(src, 'my-skill/SKILL.md')).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/skills/my-skill/SKILL.md'
    );
  });

  it('should build GitLab raw URL', () => {
    const src = parseSource('https://gitlab.com/group/project')!;
    expect(buildRawUrl(src, 'my-skill/SKILL.md')).toBe(
      'https://gitlab.com/group/project/-/raw/main/my-skill/SKILL.md'
    );
  });

  it('should return empty string for local sources', () => {
    const src = parseSource('/home/user/skills')!;
    expect(buildRawUrl(src, 'anything')).toBe('');
  });
});

describe('buildTreeApiUrl', () => {
  it('should build GitHub API URL', () => {
    const src = parseSource('anthropics/skills')!;
    expect(buildTreeApiUrl(src)).toBe(
      'https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1'
    );
  });

  it('should build GitLab API URL', () => {
    const src = parseSource('https://gitlab.com/group/project')!;
    expect(buildTreeApiUrl(src)).toContain('gitlab.com/api/v4/projects');
  });
});
