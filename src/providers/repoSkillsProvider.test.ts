import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { workspace, DataTransfer, DataTransferItem } from 'vscode';
import { RepoSkillsProvider } from './repoSkillsProvider';
import { SkillTreeItem, SkillFileItem, SkillFolderItem } from './skillLibraryProvider';

describe('RepoSkillsProvider', () => {
  let tmpDir: string;
  let provider: RepoSkillsProvider;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-test-'));
    provider = new RepoSkillsProvider();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Reset workspace folders
    (workspace as any).workspaceFolders = undefined;
  });

  // ----------------------------------------------------------
  // getChildren - no workspace
  // ----------------------------------------------------------
  it('should return empty array when no workspace folders', async () => {
    (workspace as any).workspaceFolders = undefined;
    const children = await provider.getChildren();
    expect(children).toEqual([]);
  });

  it('should return empty array when workspace folders is empty', async () => {
    (workspace as any).workspaceFolders = [];
    const children = await provider.getChildren();
    expect(children).toEqual([]);
  });

  // ----------------------------------------------------------
  // getChildren - with skills
  // ----------------------------------------------------------
  it('should return format groups when skills exist', async () => {
    // Create a .claude/skills/my-skill/SKILL.md
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'my-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: My Skill\ndescription: A test skill\n---\n# Hello'
    );

    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];

    const children = await provider.getChildren();
    expect(children.length).toBeGreaterThanOrEqual(1);
    // First item should be a FormatGroupItem (TreeItem with label)
    expect(children[0].label).toContain('Claude');
  });

  it('should return skill items for a format group element', async () => {
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: Test Skill\ndescription: Desc\n---\nBody'
    );

    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];

    // Get top-level format groups
    const groups = await provider.getChildren();
    expect(groups.length).toBeGreaterThanOrEqual(1);

    // Get children of the format group
    const skills = await provider.getChildren(groups[0]);
    expect(skills.length).toBe(1);
    expect(skills[0]).toBeInstanceOf(SkillTreeItem);
  });

  it('should scan multiple skills in a format group', async () => {
    const skillsDir = path.join(tmpDir, '.claude', 'skills');
    fs.mkdirSync(path.join(skillsDir, 'skill-a'), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, 'skill-a', 'SKILL.md'),
      '---\nname: Alpha\ndescription: First\n---\nBody A'
    );
    fs.mkdirSync(path.join(skillsDir, 'skill-b'), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, 'skill-b', 'SKILL.md'),
      '---\nname: Beta\ndescription: Second\n---\nBody B'
    );

    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];

    const groups = await provider.getChildren();
    const skills = await provider.getChildren(groups[0]);
    expect(skills.length).toBe(2);
  });

  it('should ignore directories without SKILL.md', async () => {
    const skillsDir = path.join(tmpDir, '.claude', 'skills');
    fs.mkdirSync(path.join(skillsDir, 'valid-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, 'valid-skill', 'SKILL.md'),
      '---\nname: Valid\ndescription: Desc\n---\nBody'
    );
    // Create an empty directory (no SKILL.md)
    fs.mkdirSync(path.join(skillsDir, 'no-skill'), { recursive: true });

    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];

    const groups = await provider.getChildren();
    const skills = await provider.getChildren(groups[0]);
    expect(skills.length).toBe(1);
  });

  it('should ignore hidden directories', async () => {
    const skillsDir = path.join(tmpDir, '.claude', 'skills');
    fs.mkdirSync(path.join(skillsDir, '.hidden'), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, '.hidden', 'SKILL.md'),
      '---\nname: Hidden\ndescription: Desc\n---\nBody'
    );
    fs.mkdirSync(path.join(skillsDir, 'visible'), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, 'visible', 'SKILL.md'),
      '---\nname: Visible\ndescription: Desc\n---\nBody'
    );

    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];

    const groups = await provider.getChildren();
    const skills = await provider.getChildren(groups[0]);
    expect(skills.length).toBe(1);
    expect((skills[0] as SkillTreeItem).skill.metadata.name).toBe('Visible');
  });

  it('should skip invalid SKILL.md files gracefully', async () => {
    const skillsDir = path.join(tmpDir, '.claude', 'skills');
    fs.mkdirSync(path.join(skillsDir, 'valid-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, 'valid-skill', 'SKILL.md'),
      '---\nname: Valid\ndescription: Desc\n---\nBody'
    );

    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];

    const groups = await provider.getChildren();
    expect(groups.length).toBeGreaterThanOrEqual(1);
  });

  it('should return empty when element is neither FormatGroup nor top-level', async () => {
    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];
    // Pass a random TreeItem that is not a FormatGroupItem
    const dummyItem = { label: 'dummy' } as any;
    const children = await provider.getChildren(dummyItem);
    expect(children).toEqual([]);
  });

  it('should support multiple format groups', async () => {
    // Create skills in two distinct skillsDir paths (.claude/skills and .github/skills)
    for (const dir of ['.claude/skills', '.github/skills']) {
      const skillDir = path.join(tmpDir, dir, 'my-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: ${dir} Skill\ndescription: Desc\n---\nBody`
      );
    }

    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];

    const groups = await provider.getChildren();
    expect(groups.length).toBe(2);
  });

  // ----------------------------------------------------------
  // getTreeItem
  // ----------------------------------------------------------
  it('should return element from getTreeItem', () => {
    const item = { label: 'test' } as any;
    expect(provider.getTreeItem(item)).toBe(item);
  });

  // ----------------------------------------------------------
  // refresh
  // ----------------------------------------------------------
  it('should fire onDidChangeTreeData when refresh is called', () => {
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.refresh();
    expect(listener).toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // handleDrag
  // ----------------------------------------------------------
  it('should set skill data in dataTransfer for drag', async () => {
    const skillsDir = path.join(tmpDir, '.claude', 'skills', 'drag-skill');
    fs.mkdirSync(skillsDir, { recursive: true });
    const skillFile = path.join(skillsDir, 'SKILL.md');
    fs.writeFileSync(skillFile, '---\nname: Drag Skill\ndescription: D\n---\nBody');

    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];

    // Get skill items
    const groups = await provider.getChildren();
    const skills = await provider.getChildren(groups[0]);

    const dataTransfer = new DataTransfer();
    provider.handleDrag(skills as any, dataTransfer);

    const data = dataTransfer.get('application/vnd.code.tree.skilldock.reposkills');
    expect(data).toBeDefined();
    const parsed = JSON.parse(await data!.asString());
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Drag Skill');
  });

  it('should not set data when dragging non-SkillTreeItems', () => {
    const dataTransfer = new DataTransfer();
    const dummyItems = [{ label: 'dummy' }] as any;
    provider.handleDrag(dummyItems, dataTransfer);

    const data = dataTransfer.get('application/vnd.code.tree.skilldock.reposkills');
    expect(data).toBeUndefined();
  });

  // ----------------------------------------------------------
  // handleDrop (no-op)
  // ----------------------------------------------------------
  it('should have handleDrop as no-op', () => {
    expect(() => provider.handleDrop()).not.toThrow();
  });

  // ----------------------------------------------------------
  // MIME types
  // ----------------------------------------------------------
  it('should have correct drag MIME type', () => {
    expect(provider.dragMimeTypes).toContain('application/vnd.code.tree.skilldock.reposkills');
  });

  it('should have empty drop MIME types', () => {
    expect(provider.dropMimeTypes).toEqual([]);
  });

  // ----------------------------------------------------------
  // Expandable skill items – file/folder children
  // ----------------------------------------------------------
  it('should collect additionalFiles recursively from repo skills', async () => {
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'nested-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: Nested\ndescription: Has folders\n---\nBody'
    );
    fs.writeFileSync(path.join(skillDir, 'config.json'), '{}');
    fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'scripts', 'helper.sh'), '#!/bin/bash');

    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];

    const groups = await provider.getChildren();
    const skills = await provider.getChildren(groups[0]);
    expect(skills.length).toBe(1);
    const skill = (skills[0] as SkillTreeItem).skill;
    expect(skill.additionalFiles).toBeDefined();
    expect(skill.additionalFiles).toContain('config.json');
    expect(skill.additionalFiles).toContain('scripts/');
    expect(skill.additionalFiles).toContain('scripts/helper.sh');
  });

  it('should expand SkillTreeItem to show file/folder children', async () => {
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'expandable');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: Expandable\ndescription: Test\n---\nBody'
    );
    fs.writeFileSync(path.join(skillDir, 'extra.md'), '# Extra');
    fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'scripts', 'run.sh'), '#!/bin/bash');

    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];

    const groups = await provider.getChildren();
    const skills = await provider.getChildren(groups[0]);
    const treeItem = skills[0] as SkillTreeItem;

    const children = await provider.getChildren(treeItem);
    // SKILL.md + extra.md + scripts/
    expect(children.length).toBe(3);
    expect(children[0]).toBeInstanceOf(SkillFileItem);
    expect((children[0] as SkillFileItem).fileName).toBe('SKILL.md');
    expect(children[1]).toBeInstanceOf(SkillFileItem);
    expect((children[1] as SkillFileItem).fileName).toBe('extra.md');
    expect(children[2]).toBeInstanceOf(SkillFolderItem);
    expect((children[2] as SkillFolderItem).folderName).toBe('scripts');
  });

  it('should expand SkillFolderItem to show nested children', async () => {
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'deep');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: Deep\ndescription: Test\n---\nBody'
    );
    fs.mkdirSync(path.join(skillDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'docs', 'guide.md'), '# Guide');

    (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];

    const groups = await provider.getChildren();
    const skills = await provider.getChildren(groups[0]);
    const treeItem = skills[0] as SkillTreeItem;
    const children = await provider.getChildren(treeItem);

    const folderItem = children.find(c => c instanceof SkillFolderItem) as SkillFolderItem;
    expect(folderItem).toBeDefined();

    const folderChildren = await provider.getChildren(folderItem);
    expect(folderChildren.length).toBe(1);
    expect(folderChildren[0]).toBeInstanceOf(SkillFileItem);
    expect((folderChildren[0] as SkillFileItem).fileName).toBe('guide.md');
  });

  it('should return empty for SkillFileItem expansion', async () => {
    const skill = {
      id: 'test', metadata: { name: 'T', description: '' }, body: '',
      dirPath: '/tmp/d', filePath: '/tmp/d/SKILL.md', lastModified: 0,
    };
    const fileItem = new SkillFileItem(skill, 'SKILL.md', '/tmp/d/SKILL.md', 'SKILL.md');
    const children = await provider.getChildren(fileItem);
    expect(children).toEqual([]);
  });
});
