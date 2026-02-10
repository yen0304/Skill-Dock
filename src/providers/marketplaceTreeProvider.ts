import * as vscode from 'vscode';
import { MarketplaceSource, BUILTIN_MARKETPLACE_SOURCES } from '../models/skill';
import { MarketplaceService } from '../services/marketplaceService';

/**
 * Tree item representing a marketplace source
 */
export class MarketplaceSourceItem extends vscode.TreeItem {
  constructor(public readonly source: MarketplaceSource) {
    super(source.label, vscode.TreeItemCollapsibleState.None);

    this.description = source.isBuiltin
      ? vscode.l10n.t('built-in')
      : vscode.l10n.t('custom');

    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${source.label}**\n\n`);
    this.tooltip.appendMarkdown(`\`${source.owner}/${source.repo}\``);
    if (source.path) {
      this.tooltip.appendMarkdown(` → \`${source.path}\``);
    }
    this.tooltip.appendMarkdown(`\n\nbranch: \`${source.branch}\``);

    this.iconPath = source.isBuiltin
      ? new vscode.ThemeIcon('verified')
      : new vscode.ThemeIcon('github');

    this.contextValue = source.isBuiltin ? 'builtinSource' : 'customSource';

    this.command = {
      command: 'skilldock.openMarketplaceSource',
      title: 'Open Marketplace',
      arguments: [this],
    };
  }
}

/**
 * TreeDataProvider for the Marketplace sidebar view.
 * Shows available sources; clicking "Open Marketplace" reveals the full webview.
 */
export class MarketplaceTreeProvider implements vscode.TreeDataProvider<MarketplaceSourceItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MarketplaceSourceItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private marketplaceService: MarketplaceService) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: MarketplaceSourceItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<MarketplaceSourceItem[]> {
    const sources = this.marketplaceService.getSources();
    return sources.map((s) => new MarketplaceSourceItem(s));
  }
}
