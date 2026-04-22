import * as path from 'path';
import * as vscode from 'vscode';
import { SavedWorkspace } from './types';
import { WorkspaceStore } from './workspaceStore';

export class WorkspaceTreeItem extends vscode.TreeItem {
  constructor(public readonly entry: SavedWorkspace) {
    super(entry.label, vscode.TreeItemCollapsibleState.None);
    this.id = entry.id;
    this.description = shortenPath(entry.path);
    this.tooltip = buildTooltip(entry);
    this.contextValue = 'workspaceEntry';
    this.resourceUri = vscode.Uri.file(entry.path);
    this.iconPath = new vscode.ThemeIcon(
      entry.kind === 'workspaceFile' ? 'multiple-windows' : 'folder'
    );
    this.command = {
      command: 'workspaceControl.openEntry',
      title: 'Abrir',
      arguments: [entry]
    };
  }
}

export class WorkspaceTreeProvider implements vscode.TreeDataProvider<WorkspaceTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    WorkspaceTreeItem | undefined | void
  >();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly store: WorkspaceStore) {
    store.onDidChange(() => this.onDidChangeTreeDataEmitter.fire());
  }

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  public getTreeItem(element: WorkspaceTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: WorkspaceTreeItem): WorkspaceTreeItem[] {
    if (element) {
      return [];
    }
    return this.store.getAll().map((entry) => new WorkspaceTreeItem(entry));
  }
}

function shortenPath(fullPath: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && fullPath.startsWith(home)) {
    return '~' + fullPath.slice(home.length);
  }
  return fullPath;
}

function buildTooltip(entry: SavedWorkspace): string {
  const lines = [entry.label, entry.path, `Tipo: ${entry.kind}`];
  if (entry.lastOpenedAt) {
    lines.push(`Último acesso: ${new Date(entry.lastOpenedAt).toLocaleString()}`);
  }
  lines.push(`Nome do item: ${path.basename(entry.path)}`);
  return lines.join('\n');
}
