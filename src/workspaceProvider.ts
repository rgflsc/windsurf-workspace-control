import * as path from 'path';
import * as vscode from 'vscode';
import { SavedWorkspace, normalizeTags } from './types';
import { WorkspaceStore } from './workspaceStore';

const UNTAGGED_LABEL = 'Untagged';

export class WorkspaceTreeItem extends vscode.TreeItem {
  constructor(public readonly entry: SavedWorkspace) {
    super(entry.label, vscode.TreeItemCollapsibleState.None);
    this.id = `ws:${entry.id}`;
    const tags = normalizeTags(entry.tags);
    this.description = tags.length > 0
      ? `${shortenPath(entry.path)}  #${tags.join(' #')}`
      : shortenPath(entry.path);
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

export class TagGroupTreeItem extends vscode.TreeItem {
  constructor(public readonly tag: string, public readonly entries: SavedWorkspace[]) {
    super(
      tag === UNTAGGED_LABEL ? UNTAGGED_LABEL : tag,
      vscode.TreeItemCollapsibleState.Expanded
    );
    this.id = `tag:${tag.toLowerCase()}`;
    this.description = `${entries.length}`;
    this.contextValue = 'tagGroup';
    this.iconPath = new vscode.ThemeIcon(tag === UNTAGGED_LABEL ? 'question' : 'tag');
  }
}

export type WorkspaceTreeNode = WorkspaceTreeItem | TagGroupTreeItem;

export class WorkspaceTreeProvider implements vscode.TreeDataProvider<WorkspaceTreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    WorkspaceTreeNode | undefined | void
  >();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly store: WorkspaceStore) {
    store.onDidChange(() => this.onDidChangeTreeDataEmitter.fire());
  }

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  public getTreeItem(element: WorkspaceTreeNode): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: WorkspaceTreeNode): WorkspaceTreeNode[] {
    if (element instanceof TagGroupTreeItem) {
      return element.entries.map((e) => new WorkspaceTreeItem(e));
    }
    if (element) {
      return [];
    }
    const entries = this.store.getAll();
    if (!isGroupByTagsEnabled()) {
      return entries.map((e) => new WorkspaceTreeItem(e));
    }
    return buildTagGroups(entries);
  }
}

export function isGroupByTagsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('workspaceControl')
    .get<boolean>('groupByTags', true);
}

function buildTagGroups(entries: SavedWorkspace[]): TagGroupTreeItem[] {
  const byTag = new Map<string, SavedWorkspace[]>();
  const untagged: SavedWorkspace[] = [];
  for (const entry of entries) {
    const tags = normalizeTags(entry.tags);
    if (tags.length === 0) {
      untagged.push(entry);
      continue;
    }
    for (const tag of tags) {
      const bucket = byTag.get(tag) ?? [];
      bucket.push(entry);
      byTag.set(tag, bucket);
    }
  }
  const groups = [...byTag.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([tag, list]) => new TagGroupTreeItem(tag, list));
  if (untagged.length > 0) {
    groups.push(new TagGroupTreeItem(UNTAGGED_LABEL, untagged));
  }
  return groups;
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
  const tags = normalizeTags(entry.tags);
  if (tags.length > 0) {
    lines.push(`Tags: ${tags.join(', ')}`);
  }
  if (entry.lastOpenedAt) {
    lines.push(`Último acesso: ${new Date(entry.lastOpenedAt).toLocaleString()}`);
  }
  lines.push(`Nome do item: ${path.basename(entry.path)}`);
  return lines.join('\n');
}
