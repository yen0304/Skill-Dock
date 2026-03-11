import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderRegistry, HostProvider } from './hostProvider';
import { MarketplaceSource, RemoteSkill } from '../models/skill';

vi.mock('vscode', () => ({
  l10n: { t: (msg: string) => msg },
}));

function makeProvider(id: string, canHandleFn?: (s: MarketplaceSource) => boolean): HostProvider {
  return {
    id,
    label: `Provider ${id}`,
    canHandle: canHandleFn ?? (() => false),
    fetchSkills: vi.fn().mockResolvedValue([]),
    dispose: vi.fn(),
  };
}

function makeSource(id: string): MarketplaceSource {
  return { id, owner: 'owner', repo: 'repo', branch: 'main', path: '', label: id, isBuiltin: false };
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe('register / unregister', () => {
    it('should register a provider', () => {
      const p = makeProvider('github');
      registry.register(p);
      expect(registry.has('github')).toBe(true);
    });

    it('should overwrite existing provider with same id', () => {
      const p1 = makeProvider('github');
      const p2 = makeProvider('github');
      registry.register(p1);
      registry.register(p2);
      expect(registry.getAll()).toHaveLength(1);
    });

    it('should unregister a provider and call dispose', () => {
      const p = makeProvider('github');
      registry.register(p);
      registry.unregister('github');
      expect(registry.has('github')).toBe(false);
      expect(p.dispose).toHaveBeenCalled();
    });

    it('should not throw when unregistering non-existent provider', () => {
      expect(() => registry.unregister('nonexistent')).not.toThrow();
    });
  });

  describe('getProvider', () => {
    it('should return provider that canHandle the source', () => {
      const p = makeProvider('github', (s) => s.id === 'gh-source');
      registry.register(p);
      expect(registry.getProvider(makeSource('gh-source'))).toBe(p);
    });

    it('should return undefined when no provider can handle source', () => {
      const p = makeProvider('github', () => false);
      registry.register(p);
      expect(registry.getProvider(makeSource('unknown'))).toBeUndefined();
    });

    it('should return first matching provider', () => {
      const p1 = makeProvider('a', () => true);
      const p2 = makeProvider('b', () => true);
      registry.register(p1);
      registry.register(p2);
      expect(registry.getProvider(makeSource('x'))).toBe(p1);
    });
  });

  describe('getAll', () => {
    it('should return all registered providers', () => {
      registry.register(makeProvider('a'));
      registry.register(makeProvider('b'));
      expect(registry.getAll()).toHaveLength(2);
    });

    it('should return empty array when no providers', () => {
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe('has', () => {
    it('should return true for registered provider', () => {
      registry.register(makeProvider('x'));
      expect(registry.has('x')).toBe(true);
    });

    it('should return false for unregistered provider', () => {
      expect(registry.has('x')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should dispose all providers and clear', () => {
      const p1 = makeProvider('a');
      const p2 = makeProvider('b');
      registry.register(p1);
      registry.register(p2);
      registry.dispose();
      expect(p1.dispose).toHaveBeenCalled();
      expect(p2.dispose).toHaveBeenCalled();
      expect(registry.getAll()).toHaveLength(0);
    });

    it('should handle providers without dispose', () => {
      const p: HostProvider = {
        id: 'no-dispose',
        label: 'No Dispose',
        canHandle: () => false,
        fetchSkills: vi.fn().mockResolvedValue([]),
      };
      registry.register(p);
      expect(() => registry.dispose()).not.toThrow();
    });
  });
});
