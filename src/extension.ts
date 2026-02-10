import * as vscode from 'vscode';
import { StorageService } from './services/storageService';
import { ImportExportService } from './services/importExportService';
import { MarketplaceService } from './services/marketplaceService';
import { SkillLibraryProvider, SkillTreeItem } from './providers/skillLibraryProvider';
import { RepoSkillsProvider } from './providers/repoSkillsProvider';
import { SkillEditorPanel } from './views/skillEditorPanel';
import { ManagerPanel } from './views/managerPanel';
import { MarketplacePanel } from './views/marketplacePanel';
import { MarketplaceTreeProvider, MarketplaceSourceItem } from './providers/marketplaceTreeProvider';
import { Skill } from './models/skill';

export function activate(context: vscode.ExtensionContext) {
  console.log('SkillDock: Activating extension');

  // Initialize services
  const storageService = new StorageService();
  const importExportService = new ImportExportService(storageService);
  const marketplaceService = new MarketplaceService(storageService);

  // Initialize tree view providers
  const libraryProvider = new SkillLibraryProvider(storageService);
  const repoSkillsProvider = new RepoSkillsProvider();
  const marketplaceTreeProvider = new MarketplaceTreeProvider(marketplaceService);

  // Wire up import service for drag-and-drop
  libraryProvider.setImportExportService(importExportService);

  // Register tree views
  const libraryTreeView = vscode.window.createTreeView('skilldock.library', {
    treeDataProvider: libraryProvider,
    showCollapseAll: false,
    dragAndDropController: libraryProvider,
  });

  const repoTreeView = vscode.window.createTreeView('skilldock.repoSkills', {
    treeDataProvider: repoSkillsProvider,
    showCollapseAll: true,
    dragAndDropController: repoSkillsProvider,
  });

  const marketplaceTreeView = vscode.window.createTreeView('skilldock.marketplace', {
    treeDataProvider: marketplaceTreeProvider,
    showCollapseAll: false,
  });

  // Helper to refresh all views
  const refreshAll = () => {
    libraryProvider.refresh();
    repoSkillsProvider.refresh();
    marketplaceTreeProvider.refresh();
  };

  // ===========================================
  // Register commands
  // ===========================================

  // Create new skill
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.createSkill', () => {
      SkillEditorPanel.createOrShow(
        context.extensionUri,
        storageService,
        null,
        true,
        refreshAll
      );
    })
  );

  // Edit skill
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.editSkill', async (item?: SkillTreeItem) => {
      let skill: Skill | null = null;

      if (item instanceof SkillTreeItem) {
        skill = item.skill;
      } else {
        skill = await pickSkill(storageService, vscode.l10n.t('Select skill to edit'));
      }

      if (skill) {
        SkillEditorPanel.createOrShow(
          context.extensionUri,
          storageService,
          skill,
          false,
          refreshAll
        );
      }
    })
  );

  // View skill (open SKILL.md in editor)
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.viewSkill', async (skillOrItem?: Skill | SkillTreeItem, _source?: string) => {
      let skill: Skill | undefined;

      if (skillOrItem instanceof SkillTreeItem) {
        skill = skillOrItem.skill;
      } else if (skillOrItem && 'filePath' in skillOrItem) {
        skill = skillOrItem as Skill;
      } else {
        const picked = await pickSkill(storageService, vscode.l10n.t('Select skill to view'));
        skill = picked || undefined;
      }

      if (skill) {
        const doc = await vscode.workspace.openTextDocument(skill.filePath);
        await vscode.window.showTextDocument(doc);
      }
    })
  );

  // Delete skill
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.deleteSkill', async (item?: SkillTreeItem) => {
      let skill: Skill | null = null;

      if (item instanceof SkillTreeItem) {
        skill = item.skill;
      } else {
        skill = await pickSkill(storageService, vscode.l10n.t('Select skill to delete'));
      }

      if (!skill) { return; }

      const confirmResult = await vscode.window.showWarningMessage(
        vscode.l10n.t('Delete skill "{0}"? This cannot be undone.', skill.metadata.name),
        vscode.l10n.t('Delete'),
        vscode.l10n.t('Cancel')
      );

      if (confirmResult === vscode.l10n.t('Delete')) {
        await storageService.deleteSkill(skill.id);
        refreshAll();
        vscode.window.showInformationMessage(
          vscode.l10n.t('Skill "{0}" deleted.', skill.metadata.name)
        );
      }
    })
  );

  // Import skill to repo
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.importSkill', async (item?: SkillTreeItem) => {
      if (item instanceof SkillTreeItem) {
        // Import specific skill - pick format
        const format = await importExportService.pickTargetFormat();
        if (!format) { return; }

        try {
          await importExportService.importToRepo(item.skill, format);
          refreshAll();
          vscode.window.showInformationMessage(
            vscode.l10n.t('Imported "{0}" to project.', item.skill.metadata.name)
          );
        } catch (err) {
          if ((err as Error).message !== 'Import cancelled') {
            vscode.window.showErrorMessage(
              vscode.l10n.t('Import failed: {0}', String(err))
            );
          }
        }
      } else {
        // Interactive import (pick skills + format)
        await importExportService.interactiveImport();
        refreshAll();
      }
    })
  );

  // Save repo skill to library
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.importSkillFromRepo', async (item?: SkillTreeItem) => {
      if (item instanceof SkillTreeItem) {
        try {
          const saved = await importExportService.exportToLibrary(item.skill);
          refreshAll();
          vscode.window.showInformationMessage(
            vscode.l10n.t('Saved "{0}" to your library.', saved.metadata.name)
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            vscode.l10n.t('Save failed: {0}', String(err))
          );
        }
      }
    })
  );

  // Add repo skill to library (inline action)
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.addToLibrary', async (item?: SkillTreeItem) => {
      if (!(item instanceof SkillTreeItem)) { return; }
      try {
        // Check for duplicate
        const existing = await storageService.readSkill(item.skill.id);
        if (existing) {
          const overwrite = vscode.l10n.t('Overwrite');
          const keepBoth = vscode.l10n.t('Keep Both');
          const skip = vscode.l10n.t('Skip');
          const choice = await vscode.window.showWarningMessage(
            vscode.l10n.t('Skill "{0}" already exists in your library.', item.skill.metadata.name),
            overwrite, keepBoth, skip,
          );
          if (!choice || choice === skip) { return; }
          if (choice === overwrite) {
            await storageService.deleteSkill(item.skill.id);
          }
        }
        const saved = await importExportService.exportToLibrary(item.skill);
        refreshAll();
        vscode.window.showInformationMessage(
          vscode.l10n.t('Saved "{0}" to your library.', saved.metadata.name)
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          vscode.l10n.t('Save failed: {0}', String(err))
        );
      }
    })
  );

  // Duplicate skill
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.duplicateSkill', async (item?: SkillTreeItem) => {
      let skill: Skill | null = null;

      if (item instanceof SkillTreeItem) {
        skill = item.skill;
      } else {
        skill = await pickSkill(storageService, vscode.l10n.t('Select skill to duplicate'));
      }

      if (!skill) { return; }

      const newId = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter ID for the duplicated skill'),
        value: `${skill.id}-copy`,
        validateInput: (value) => {
          if (!value.trim()) { return vscode.l10n.t('ID is required'); }
          if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
            return vscode.l10n.t('Use lowercase letters, numbers, and hyphens only');
          }
          return null;
        },
      });

      if (!newId) { return; }

      try {
        const duplicated = await storageService.duplicateSkill(skill.id, newId);
        refreshAll();
        vscode.window.showInformationMessage(
          vscode.l10n.t('Duplicated "{0}" as "{1}".', skill.metadata.name, duplicated.id)
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          vscode.l10n.t('Duplicate failed: {0}', String(err))
        );
      }
    })
  );

  // Search skills
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.searchSkills', async () => {
      const query = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Search skills by name, description, or tags'),
        placeHolder: vscode.l10n.t('Enter search query...'),
      });

      if (query !== undefined) {
        libraryProvider.setFilter(query);
      }
    })
  );

  // Refresh commands
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.refreshLibrary', () => {
      libraryProvider.refresh();
    })
  );

  // Sort library
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.sortLibrary', async () => {
      const current = vscode.workspace.getConfiguration('skilldock').get<string>('librarySortBy', 'name');
      const items = [
        { label: vscode.l10n.t('Name (A-Z)'), value: 'name' },
        { label: vscode.l10n.t('Last Modified (Newest)'), value: 'lastModified' },
        { label: vscode.l10n.t('Author (A-Z)'), value: 'author' },
      ].map((i) => ({ ...i, description: i.value === current ? '✓' : '' }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: vscode.l10n.t('Select sort order'),
      });

      if (selected) {
        await vscode.workspace.getConfiguration('skilldock').update(
          'librarySortBy', selected.value, vscode.ConfigurationTarget.Global,
        );
        libraryProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.refreshRepoSkills', () => {
      repoSkillsProvider.refresh();
    })
  );

  // Open library folder
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.openLibraryFolder', () => {
      const libraryUri = vscode.Uri.file(storageService.libraryPath);
      vscode.commands.executeCommand('revealFileInOS', libraryUri);
    })
  );

  // Open Manager panel
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.openManager', () => {
      ManagerPanel.createOrShow(
        context.extensionUri,
        storageService,
        importExportService,
        refreshAll
      );
    })
  );

  // Open Marketplace panel
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.openMarketplace', () => {
      MarketplacePanel.createOrShow(
        context.extensionUri,
        marketplaceService,
        refreshAll
      );
    })
  );

  // Open Marketplace filtered by a specific source (from tree view click)
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.openMarketplaceSource', (item?: MarketplaceSourceItem) => {
      const sourceId = item instanceof MarketplaceSourceItem ? item.source.id : undefined;
      MarketplacePanel.createOrShow(
        context.extensionUri,
        marketplaceService,
        refreshAll,
        sourceId,
      );
    })
  );

  // Add custom marketplace source
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.addMarketplaceSource', async () => {
      const url = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter a GitHub repository URL'),
        placeHolder: 'https://github.com/owner/repo',
        validateInput: (value) => {
          if (!value.trim()) {
            return vscode.l10n.t('URL is required');
          }
          if (!MarketplaceService.parseGitHubUrl(value)) {
            return vscode.l10n.t('Invalid GitHub URL: {0}', value);
          }
          return null;
        },
      });
      if (!url) { return; }
      try {
        await marketplaceService.addCustomSource(url);
        refreshAll();
        vscode.window.showInformationMessage(
          vscode.l10n.t('Source added: {0}', url)
        );
      } catch (err) {
        vscode.window.showErrorMessage(String(err));
      }
    })
  );

  // Remove custom marketplace source (from tree view context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('skilldock.removeMarketplaceSource', async (item?: MarketplaceSourceItem) => {
      if (!(item instanceof MarketplaceSourceItem) || item.source.isBuiltin) { return; }
      const confirm = await vscode.window.showWarningMessage(
        vscode.l10n.t('Remove marketplace source "{0}"?', item.source.label),
        vscode.l10n.t('Remove'),
        vscode.l10n.t('Cancel')
      );
      if (confirm !== vscode.l10n.t('Remove')) { return; }
      try {
        await marketplaceService.removeCustomSource(item.source.id);
        refreshAll();
      } catch (err) {
        vscode.window.showErrorMessage(String(err));
      }
    })
  );

  // ===========================================
  // Watch for workspace changes
  // ===========================================
  const watcher = vscode.workspace.createFileSystemWatcher('**/{.claude,.cursor,.codex,.github}/skills/*/SKILL.md');
  watcher.onDidChange(() => repoSkillsProvider.refresh());
  watcher.onDidCreate(() => repoSkillsProvider.refresh());
  watcher.onDidDelete(() => repoSkillsProvider.refresh());

  context.subscriptions.push(
    libraryTreeView,
    repoTreeView,
    marketplaceTreeView,
    watcher,
    { dispose: () => storageService.dispose() },
  );

  console.log('SkillDock: Extension activated successfully');
}

/**
 * Helper: show a quick pick to select a skill from the library
 */
async function pickSkill(storageService: StorageService, placeholder: string): Promise<Skill | null> {
  const skills = await storageService.listSkills();
  if (skills.length === 0) {
    vscode.window.showInformationMessage(vscode.l10n.t('Your skill library is empty.'));
    return null;
  }

  const items = skills.map(skill => ({
    label: skill.metadata.name,
    description: skill.id,
    detail: skill.metadata.description,
    skill,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: placeholder,
  });

  return selected?.skill || null;
}

export function deactivate() {
  console.log('SkillDock: Extension deactivated');
}
