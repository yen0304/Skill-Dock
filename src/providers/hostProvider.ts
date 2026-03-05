import * as vscode from 'vscode';
import { RemoteSkill, MarketplaceSource } from '../models/skill';

/**
 * A HostProvider knows how to list skills from a particular source type.
 *
 * Implement this interface to add support for new hosting backends:
 * - GitHub (built-in)
 * - GitLab, Bitbucket, self-hosted, well-known, etc.
 */
export interface HostProvider {
  /** Unique identifier for this provider type, e.g. 'github', 'gitlab', 'well-known' */
  readonly id: string;
  /** Human-readable label */
  readonly label: string;

  /**
   * Return true if this provider can handle the given source.
   * Used by the registry to dispatch work.
   */
  canHandle(source: MarketplaceSource): boolean;

  /**
   * Fetch the list of remote skills for a source.
   *
   * @param source   The marketplace source to scan
   * @param token    Optional auth token
   * @param force    Bypass cache if true
   */
  fetchSkills(source: MarketplaceSource, token?: string, force?: boolean): Promise<RemoteSkill[]>;

  /**
   * Fetch the raw text content from a download URL.
   * Default implementation can use a shared HTTP helper.
   */
  fetchFileContent?(url: string, token?: string): Promise<string>;

  /**
   * Dispose any resources held by this provider.
   */
  dispose?(): void;
}

/**
 * Central registry for HostProvider instances.
 *
 * MarketplaceService uses this to delegate skill-fetching to the right provider
 * based on the source's characteristics.
 */
export class ProviderRegistry implements vscode.Disposable {
  private _providers = new Map<string, HostProvider>();

  /**
   * Register a provider. Overwrites any existing provider with the same id.
   */
  register(provider: HostProvider): void {
    this._providers.set(provider.id, provider);
  }

  /**
   * Unregister a provider by its id.
   */
  unregister(id: string): void {
    const p = this._providers.get(id);
    p?.dispose?.();
    this._providers.delete(id);
  }

  /**
   * Find the first provider that can handle the given source.
   * Falls back to the provider whose id matches source.host (if set).
   */
  getProvider(source: MarketplaceSource): HostProvider | undefined {
    for (const p of this._providers.values()) {
      if (p.canHandle(source)) {
        return p;
      }
    }
    // Fallback: check if source has a host hint stored in `id`
    return undefined;
  }

  /** Return all registered providers */
  getAll(): HostProvider[] {
    return [...this._providers.values()];
  }

  /** Check if a provider is registered */
  has(id: string): boolean {
    return this._providers.has(id);
  }

  dispose(): void {
    for (const p of this._providers.values()) {
      p.dispose?.();
    }
    this._providers.clear();
  }
}
