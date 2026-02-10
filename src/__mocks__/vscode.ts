/**
 * Minimal vscode module mock for unit testing
 */

import { vi } from 'vitest';

export const l10n = {
  t: (message: string, ...args: unknown[]) => {
    let result = message;
    args.forEach((arg, i) => {
      result = result.replace(`{${i}}`, String(arg));
    });
    return result;
  },
};

export class EventEmitter {
  private listeners: Array<(...args: unknown[]) => void> = [];

  event = (listener: (...args: unknown[]) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };

  fire(...args: unknown[]) {
    this.listeners.forEach(l => l(...args));
  }

  dispose() {
    this.listeners = [];
  }
}

export class Uri {
  static file(path: string) {
    return { fsPath: path, scheme: 'file', path };
  }
  static joinPath(base: { path: string }, ...segments: string[]) {
    return Uri.file([base.path, ...segments].join('/'));
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label?: string;
  collapsibleState?: TreeItemCollapsibleState;
  tooltip?: unknown;
  description?: string;
  contextValue?: string;
  iconPath?: unknown;
  command?: unknown;

  constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export class MarkdownString {
  private content = '';
  appendMarkdown(val: string) {
    this.content += val;
  }
  toString() {
    return this.content;
  }
}

export enum ViewColumn {
  One = 1,
  Two = 2,
}

export const window = {
  activeTextEditor: undefined as unknown,
  createWebviewPanel: vi.fn(() => ({
    webview: {
      html: '',
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn(),
    },
    onDidDispose: vi.fn(),
    reveal: vi.fn(),
    dispose: vi.fn(),
  })),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showInputBox: vi.fn(),
  showQuickPick: vi.fn(),
  showTextDocument: vi.fn(),
  createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
};

export const workspace = {
  workspaceFolders: undefined as unknown,
  getConfiguration: vi.fn(() => ({
    get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
  })),
  createFileSystemWatcher: vi.fn(() => ({
    onDidChange: vi.fn(),
    onDidCreate: vi.fn(),
    onDidDelete: vi.fn(),
    dispose: vi.fn(),
  })),
  openTextDocument: vi.fn(),
};

export const commands = {
  registerCommand: vi.fn((_id: string, _cb: (...args: unknown[]) => unknown) => ({ dispose: () => {} })),
  executeCommand: vi.fn(),
};

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export class DataTransferItem {
  constructor(public value: unknown) {}
  asString(): Thenable<string> {
    return Promise.resolve(typeof this.value === 'string' ? this.value : JSON.stringify(this.value));
  }
}

export class DataTransfer {
  private _map = new Map<string, DataTransferItem>();
  get(mimeType: string): DataTransferItem | undefined {
    return this._map.get(mimeType);
  }
  set(mimeType: string, item: DataTransferItem): void {
    this._map.set(mimeType, item);
  }
}
