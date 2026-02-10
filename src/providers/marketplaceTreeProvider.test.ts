import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketplaceTreeProvider, MarketplaceSourceItem } from './marketplaceTreeProvider';
import { MarketplaceSource, BUILTIN_MARKETPLACE_SOURCES } from '../models/skill';
import { TreeItemCollapsibleState } from 'vscode';

describe('MarketplaceSourceItem', () => {
  const builtinSource: MarketplaceSource = {
    id: 'anthropics/skills',
    owner: 'anthropics',
    repo: 'skills',
    branch: 'main',
    path: '',
    label: 'Anthropic Skills',
    isBuiltin: true,
  };

  const customSource: MarketplaceSource = {
    id: 'myorg/myskills',
    owner: 'myorg',
    repo: 'myskills',
    branch: 'main',
    path: '',
    label: 'myorg/myskills',
    isBuiltin: false,
  };

  const sourceWithPath: MarketplaceSource = {
    id: 'github/awesome-copilot/skills',
    owner: 'github',
    repo: 'awesome-copilot',
    branch: 'main',
    path: 'skills',
    label: 'GitHub Copilot Skills',
    isBuiltin: true,
  };

  it('should create tree item with correct label', () => {
    const item = new MarketplaceSourceItem(builtinSource);
    expect(item.label).toBe('Anthropic Skills');
  });

  it('should have TreeItemCollapsibleState.None', () => {
    const item = new MarketplaceSourceItem(builtinSource);
    expect(item.collapsibleState).toBe(TreeItemCollapsibleState.None);
  });

  it('should show "built-in" description for builtin sources', () => {
    const item = new MarketplaceSourceItem(builtinSource);
    expect(item.description).toBe('built-in');
  });

  it('should show "custom" description for custom sources', () => {
    const item = new MarketplaceSourceItem(customSource);
    expect(item.description).toBe('custom');
  });

  it('should have tooltip with owner/repo', () => {
    const item = new MarketplaceSourceItem(builtinSource);
    expect(item.tooltip).toBeDefined();
    expect(item.tooltip!.toString()).toContain('anthropics/skills');
  });

  it('should include path in tooltip when present', () => {
    const item = new MarketplaceSourceItem(sourceWithPath);
    expect(item.tooltip!.toString()).toContain('skills');
  });

  it('should use verified icon for builtin sources', () => {
    const item = new MarketplaceSourceItem(builtinSource);
    expect((item.iconPath as any).id).toBe('verified');
  });

  it('should use github icon for custom sources', () => {
    const item = new MarketplaceSourceItem(customSource);
    expect((item.iconPath as any).id).toBe('github');
  });

  it('should set contextValue to builtinSource for builtin', () => {
    const item = new MarketplaceSourceItem(builtinSource);
    expect(item.contextValue).toBe('builtinSource');
  });

  it('should set contextValue to customSource for custom', () => {
    const item = new MarketplaceSourceItem(customSource);
    expect(item.contextValue).toBe('customSource');
  });

  it('should have command to open marketplace', () => {
    const item = new MarketplaceSourceItem(builtinSource);
    expect(item.command).toBeDefined();
    expect((item.command as any).command).toBe('skilldock.openMarketplaceSource');
  });

  it('should store the source reference', () => {
    const item = new MarketplaceSourceItem(builtinSource);
    expect(item.source).toBe(builtinSource);
  });
});

describe('MarketplaceTreeProvider', () => {
  let mockService: any;
  let provider: MarketplaceTreeProvider;

  beforeEach(() => {
    mockService = {
      getSources: vi.fn(() => BUILTIN_MARKETPLACE_SOURCES),
    };
    provider = new MarketplaceTreeProvider(mockService);
  });

  it('should return tree items for all sources', async () => {
    const children = await provider.getChildren();
    expect(children).toHaveLength(BUILTIN_MARKETPLACE_SOURCES.length);
    expect(children[0]).toBeInstanceOf(MarketplaceSourceItem);
    expect(children[0].source.id).toBe('anthropics/skills');
  });

  it('should return element itself from getTreeItem', () => {
    const item = new MarketplaceSourceItem(BUILTIN_MARKETPLACE_SOURCES[0]);
    expect(provider.getTreeItem(item)).toBe(item);
  });

  it('should fire onDidChangeTreeData when refresh is called', () => {
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.refresh();
    expect(listener).toHaveBeenCalled();
  });

  it('should handle empty sources', async () => {
    mockService.getSources.mockReturnValue([]);
    const children = await provider.getChildren();
    expect(children).toHaveLength(0);
  });

  it('should include custom sources from service', async () => {
    const custom: MarketplaceSource = {
      id: 'custom/repo',
      owner: 'custom',
      repo: 'repo',
      branch: 'main',
      path: '',
      label: 'custom/repo',
      isBuiltin: false,
    };
    mockService.getSources.mockReturnValue([...BUILTIN_MARKETPLACE_SOURCES, custom]);
    const children = await provider.getChildren();
    expect(children).toHaveLength(BUILTIN_MARKETPLACE_SOURCES.length + 1);
    expect(children[children.length - 1].source.id).toBe('custom/repo');
  });
});
