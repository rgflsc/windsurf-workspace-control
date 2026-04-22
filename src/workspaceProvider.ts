import * as path from 'path';
import * as vscode from 'vscode';
import { SavedWorkspace, normalizeTags } from './types';
import { WorkspaceStore } from './workspaceStore';
import { TagColorStore } from './tagColorStore';
import { FilterState, UNTAGGED_FILTER_KEY } from './filterState';

const UNTAGGED_LABEL = 'Untagged';

export class WorkspaceTreeItem extends vscode.TreeItem {
  constructor(
    public readonly entry: SavedWorkspace,
    colorStore: TagColorStore
  ) {
    super(entry.label, vscode.TreeItemCollapsibleState.None);
    this.id = `ws:${entry.id}`;
    const tags = normalizeTags(entry.tags);
    this.description = tags.length > 0
      ? `${shortenPath(entry.path)}  #${tags.join(' #')}`
      : shortenPath(entry.path);
    this.tooltip = buildTooltip(entry);
    this.contextValue = 'workspaceEntry';
    this.resourceUri = vscode.Uri.file(entry.path);
    const iconId = entry.kind === 'workspaceFile' ? 'multiple-windows' : 'folder';
    const firstTagColor = tags.length > 0 ? colorStore.getThemeColor(tags[0]) : undefined;
    this.iconPath = firstTagColor
      ? new vscode.ThemeIcon(iconId, firstTagColor)
      : new vscode.ThemeIcon(iconId);
    this.command = {
      command: 'workspaceControl.openEntry',
      title: 'Abrir',
      arguments: [entry]
    };
  }
}

export class TagGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly tag: string,
    public readonly entries: SavedWorkspace[],
    colorStore: TagColorStore
  ) {
    super(
      tag === UNTAGGED_LABEL ? UNTAGGED_LABEL : tag,
      vscode.TreeItemCollapsibleState.Expanded
    );
    this.id = `tag:${tag.toLowerCase()}`;
    this.description = `${entries.length}`;
    this.contextValue = tag === UNTAGGED_LABEL ? 'untaggedGroup' : 'tagGroup';
    const iconId = tag === UNTAGGED_LABEL ? 'question' : 'tag';
    const color = tag === UNTAGGED_LABEL ? undefined : colorStore.getThemeColor(tag);
    this.iconPath = color ? new vscode.ThemeIcon(iconId, color) : new vscode.ThemeIcon(iconId);
  }
}

export class FilterIndicatorTreeItem extends vscode.TreeItem {
  constructor(activeLabels: readonly string[]) {
    super(`Filtrando: ${activeLabels.map((t) => `#${t}`).join(' ')}`, vscode.TreeItemCollapsibleState.None);
    this.id = 'filter:indicator';
    this.contextValue = 'filterIndicator';
    this.iconPath = new vscode.ThemeIcon('filter-filled');
    this.command = {
      command: 'workspaceControl.clearFilter',
      title: 'Limpar filtro',
      arguments: []
    };
    this.tooltip = 'Clique para limpar o filtro';
  }
}

export type WorkspaceTreeNode =
  | WorkspaceTreeItem
  | TagGroupTreeItem
  | FilterIndicatorTreeItem;

export class WorkspaceTreeProvider
  implements vscode.TreeDataProvider<WorkspaceTreeNode>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    WorkspaceTreeNode | undefined | void
  >();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: WorkspaceStore,
    private readonly filter: FilterState,
    private readonly colorStore: TagColorStore
  ) {
    this.disposables.push(
      store.onDidChange(() => this.fire()),
      filter.onDidChange(() => this.fire()),
      colorStore.onDidChange(() => this.fire()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('workspaceControl.groupByTags') ||
          event.affectsConfiguration('workspaceControl.storageScope')
        ) {
          this.fire();
        }
      })
    );
  }

  private fire(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  public refresh(): void {
    this.fire();
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.onDidChangeTreeDataEmitter.dispose();
  }

  public getTreeItem(element: WorkspaceTreeNode): vscode.TreeItem {
    return element;
  }

  public getParent(_element: WorkspaceTreeNode): WorkspaceTreeNode | undefined {
    // Only used by TreeView.reveal; we treat groups and indicators as roots
    // and do not need parent resolution for child workspace items.
    return undefined;
  }

  public getChildren(element?: WorkspaceTreeNode): WorkspaceTreeNode[] {
    if (element instanceof TagGroupTreeItem) {
      return element.entries.map((e) => new WorkspaceTreeItem(e, this.colorStore));
    }
    if (element) {
      return [];
    }
    const entries = this.store.getAll().filter((e) =>
      this.filter.matches(normalizeTags(e.tags).map((t) => t.toLowerCase()))
    );

    const roots: WorkspaceTreeNode[] = [];
    if (this.filter.isActive) {
      roots.push(new FilterIndicatorTreeItem(this.filter.getActiveLabels()));
    }

    if (!isGroupByTagsEnabled()) {
      for (const entry of entries) {
        roots.push(new WorkspaceTreeItem(entry, this.colorStore));
      }
      return roots;
    }
    roots.push(...buildTagGroups(entries, this.colorStore, this.filter));
    return roots;
  }
}

export function isGroupByTagsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('workspaceControl')
    .get<boolean>('groupByTags', true);
}

function buildTagGroups(
  entries: SavedWorkspace[],
  colorStore: TagColorStore,
  filter: FilterState
): TagGroupTreeItem[] {
  const activeFilterTags = new Set(filter.getActive());
  const byTag = new Map<string, SavedWorkspace[]>();
  const untagged: SavedWorkspace[] = [];
  for (const entry of entries) {
    const tags = normalizeTags(entry.tags);
    if (tags.length === 0) {
      untagged.push(entry);
      continue;
    }
    for (const tag of tags) {
      if (
        filter.isActive &&
        !activeFilterTags.has(tag.toLowerCase()) &&
        !(activeFilterTags.has(UNTAGGED_FILTER_KEY) && tags.length === 0)
      ) {
        continue;
      }
      const bucket = byTag.get(tag) ?? [];
      bucket.push(entry);
      byTag.set(tag, bucket);
    }
  }
  const groups = [...byTag.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([tag, list]) => new TagGroupTreeItem(tag, list, colorStore));
  if (untagged.length > 0) {
    groups.push(new TagGroupTreeItem(UNTAGGED_LABEL, untagged, colorStore));
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
