import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { workspace, window as vscodeWindow } from 'vscode';
import { ImportExportService } from './importExportService';
import { StorageService } from './storageService';
import { Skill } from '../models/skill';

let mockLibraryPath = '';
vi.mock('vscode', async () => {
  const actual = await vi.importActual<typeof import('vscode')>('vscode');
  return {
    ...actual,
    workspace: {
      ...actual.workspace,
      workspaceFolders: undefined as unknown,
      getConfiguration: vi.fn(() => ({
        get: (key: string, def?: unknown) => {
          if (key === 'libraryPath') { return mockLibraryPath; }
          if (key === 'defaultTarget') { return 'claude'; }
          return def;
        },
      })),
    },
  };
});

describe('ImportExportService', () => {
  let tmpDir: string;
  let workspaceDir: string;
  let storageService: StorageService;
  let service: ImportExportService;

  const sampleSkill: Skill = {
    id: 'test-skill',
    metadata: {
      name: 'Test Skill',
      description: 'A test skill',
      author: 'Tester',
    },
    body: '# Test\nHello world',
    dirPath: '', // set in beforeEach
    filePath: '', // set in beforeEach
    lastModified: Date.now(),
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-test-'));
    workspaceDir = path.join(tmpDir, 'workspace');
    const libraryDir = path.join(tmpDir, 'library');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(libraryDir, { recursive: true });
    mockLibraryPath = libraryDir;

    // Create the sample skill's source directory
    const srcSkillDir = path.join(tmpDir, 'source-skill');
    fs.mkdirSync(srcSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcSkillDir, 'SKILL.md'),
      '---\nname: Test Skill\ndescription: A test skill\nauthor: Tester\n---\n# Test\nHello world'
    );
    sampleSkill.dirPath = srcSkillDir;
    sampleSkill.filePath = path.join(srcSkillDir, 'SKILL.md');

    storageService = new StorageService();
    service = new ImportExportService(storageService);

    // Set workspace folders
    (workspace as any).workspaceFolders = [{ uri: { fsPath: workspaceDir } }];
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    (workspace as any).workspaceFolders = undefined;
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------------
  // importToRepo
  // ----------------------------------------------------------
  describe('importToRepo', () => {
    it('should copy skill to .claude/skills directory', async () => {
      const targetDir = await service.importToRepo(sampleSkill, 'claude');
      expect(fs.existsSync(targetDir)).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'SKILL.md'))).toBe(true);

      const content = fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf-8');
      expect(content).toContain('Test Skill');
    });

    it('should copy skill to .cursor/skills directory', async () => {
      const targetDir = await service.importToRepo(sampleSkill, 'cursor');
      expect(targetDir).toContain('.cursor');
      expect(fs.existsSync(path.join(targetDir, 'SKILL.md'))).toBe(true);
    });

    it('should copy skill to .github/skills directory', async () => {
      const targetDir = await service.importToRepo(sampleSkill, 'github');
      expect(targetDir).toContain('.github');
      expect(fs.existsSync(path.join(targetDir, 'SKILL.md'))).toBe(true);
    });

    it('should create scaffold directories for codex format', async () => {
      const targetDir = await service.importToRepo(sampleSkill, 'codex');
      expect(fs.existsSync(path.join(targetDir, 'agents'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'scripts'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'references'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'assets'))).toBe(true);
    });

    it('should throw when no workspace folder is open', async () => {
      (workspace as any).workspaceFolders = undefined;
      await expect(service.importToRepo(sampleSkill, 'claude')).rejects.toThrow('No workspace folder open');
    });

    it('should throw when workspace folders is empty', async () => {
      (workspace as any).workspaceFolders = [];
      await expect(service.importToRepo(sampleSkill, 'claude')).rejects.toThrow('No workspace folder open');
    });

    it('should prompt for overwrite when target exists', async () => {
      // Create existing target
      const targetDir = path.join(workspaceDir, '.claude', 'skills', 'test-skill');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'SKILL.md'), 'old');

      // Mock overwrite confirmation
      vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Overwrite' as any);

      const result = await service.importToRepo(sampleSkill, 'claude');
      expect(fs.existsSync(result)).toBe(true);
      const content = fs.readFileSync(path.join(result, 'SKILL.md'), 'utf-8');
      expect(content).toContain('Test Skill');
    });

    it('should throw Import cancelled when user cancels overwrite', async () => {
      const targetDir = path.join(workspaceDir, '.claude', 'skills', 'test-skill');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'SKILL.md'), 'old');

      vi.mocked(vscodeWindow.showWarningMessage).mockResolvedValue('Cancel' as any);

      await expect(service.importToRepo(sampleSkill, 'claude')).rejects.toThrow('Import cancelled');
    });

    it('should copy nested files in skill directory', async () => {
      // Add a sub-directory with a file
      const subDir = path.join(sampleSkill.dirPath, 'examples');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'example.md'), '# Example');

      const targetDir = await service.importToRepo(sampleSkill, 'claude');
      expect(fs.existsSync(path.join(targetDir, 'examples', 'example.md'))).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // importMultipleToRepo
  // ----------------------------------------------------------
  describe('importMultipleToRepo', () => {
    it('should import multiple skills', async () => {
      // Create a second skill
      const skill2Dir = path.join(tmpDir, 'source-skill-2');
      fs.mkdirSync(skill2Dir, { recursive: true });
      fs.writeFileSync(
        path.join(skill2Dir, 'SKILL.md'),
        '---\nname: Skill Two\ndescription: Second\n---\nBody'
      );
      const skill2: Skill = {
        ...sampleSkill,
        id: 'skill-two',
        dirPath: skill2Dir,
        filePath: path.join(skill2Dir, 'SKILL.md'),
      };

      const results = await service.importMultipleToRepo([sampleSkill, skill2], 'claude');
      expect(results).toHaveLength(2);
      expect(fs.existsSync(results[0])).toBe(true);
      expect(fs.existsSync(results[1])).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // exportToLibrary
  // ----------------------------------------------------------
  describe('exportToLibrary', () => {
    it('should save skill to library via storageService', async () => {
      const result = await service.exportToLibrary(sampleSkill);
      // ID is derived from the directory name (source-skill)
      expect(result.id).toBe('source-skill');
      expect(result.metadata.name).toBe('Test Skill');

      // Verify it's in the library
      const listed = await storageService.listSkills();
      expect(listed.some(s => s.id === 'source-skill')).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // interactiveImport
  // ----------------------------------------------------------
  describe('interactiveImport', () => {
    it('should show message when library is empty', async () => {
      await service.interactiveImport();
      expect(vscodeWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('empty')
      );
    });

    it('should do nothing when user cancels skill selection', async () => {
      // Create a skill in library
      const skillDir = path.join(mockLibraryPath, 'int-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: Int Skill\ndescription: D\n---\nBody'
      );

      vi.mocked(vscodeWindow.showQuickPick).mockResolvedValue(undefined as any);

      await service.interactiveImport();
      // No error thrown, no import happened
    });

    it('should do nothing when user selects empty array', async () => {
      const skillDir = path.join(mockLibraryPath, 'int-skill2');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: Int Skill2\ndescription: D\n---\nBody'
      );

      vi.mocked(vscodeWindow.showQuickPick).mockResolvedValue([] as any);

      await service.interactiveImport();
    });
  });

  // ----------------------------------------------------------
  // pickTargetFormat
  // ----------------------------------------------------------
  describe('pickTargetFormat', () => {
    it('should return selected format', async () => {
      vi.mocked(vscodeWindow.showQuickPick).mockResolvedValue({
        label: 'Claude',
        format: 'claude',
      } as any);

      const format = await service.pickTargetFormat();
      expect(format).toBe('claude');
    });

    it('should return undefined when user cancels', async () => {
      vi.mocked(vscodeWindow.showQuickPick).mockResolvedValue(undefined as any);

      const format = await service.pickTargetFormat();
      expect(format).toBeUndefined();
    });
  });
});
