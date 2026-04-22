import * as path from 'path';
import * as vscode from 'vscode';
import { SavedWorkspace, normalizeTags } from './types';
import { WorkspaceStore } from './workspaceStore';
import { TagColorStore } from './tagColorStore';
import { FilterState, UNTAGGED_FILTER_KEY } from './filterState';
import { findCurrentEntry } from './currentWorkspace';

const UNTAGGED_LABEL = 'Untagged';
const CURRENT_MARK = '● ';
const PINNED_MARK = '★ ';

export class WorkspaceTreeItem extends vscode.TreeItem {
  constructor(
    public readonly entry: SavedWorkspace,
    colorStore: TagColorStore,
    isCurrent = false
  ) {
    const isPinned = !!entry.pinned;
    const prefix = `${isPinned ? PINNED_MARK : ''}${isCurrent ? CURRENT_MARK : ''}`;
    super(`${prefix}${entry.label}`, vscode.TreeItemCollapsibleState.None);
    this.id = `ws:${entry.id}`;
    const tags = normalizeTags(entry.tags);
    const pathDesc = shortenPath(entry.path);
    const tagsDesc = tags.length > 0 ? `  #${tags.join(' #')}` : '';
    const markers: string[] = [];
    if (isCurrent) markers.push('atual');
    if (isPinned) markers.push('pinado');
    const markerDesc = markers.length > 0 ? `${markers.join(' · ')}  •  ` : '';
    this.description = `${markerDesc}${pathDesc}${tagsDesc}`;
    this.tooltip = buildTooltip(entry, isCurrent, isPinned);
    this.contextValue = buildContextValue(isCurrent, isPinned);
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

function buildContextValue(isCurrent: boolean, isPinned: boolean): string {
  let value = 'workspaceEntry';
  if (isPinned) value += '.pinned';
  if (isCurrent) value += '.current';
  return value;
}

export class TagGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly tag: string,
    public readonly entries: SavedWorkspace[],
    colorStore: TagColorStore,
    collapsed = false
  ) {
    super(
      tag === UNTAGGED_LABEL ? UNTAGGED_LABEL : tag,
      collapsed
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.Expanded
    );
    this.id = `tag:${collapsed ? 'c' : 'e'}:${tag.toLowerCase()}`;
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

  private groupsCollapsed = false;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly filter: FilterState,
    private readonly colorStore: TagColorStore
  ) {
    vscode.commands.executeCommand(
      'setContext',
      'workspaceControl.groupsCollapsed',
      false
    );
    this.disposables.push(
      store.onDidChange(() => this.fire()),
      filter.onDidChange(() => this.fire()),
      colorStore.onDidChange(() => this.fire()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.fire()),
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

  public get areGroupsCollapsed(): boolean {
    return this.groupsCollapsed;
  }

  public async setGroupsCollapsed(collapsed: boolean): Promise<void> {
    if (this.groupsCollapsed === collapsed) {
      return;
    }
    this.groupsCollapsed = collapsed;
    await vscode.commands.executeCommand(
      'setContext',
      'workspaceControl.groupsCollapsed',
      collapsed
    );
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
    const currentId = findCurrentEntry(this.store)?.id;
    if (element instanceof TagGroupTreeItem) {
      return [...element.entries]
        .sort(byLabel)
        .map((e) => new WorkspaceTreeItem(e, this.colorStore, e.id === currentId));
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
      const sorted = [...entries].sort(byLabel);
      for (const entry of sorted) {
        roots.push(new WorkspaceTreeItem(entry, this.colorStore, entry.id === currentId));
      }
      return roots;
    }
    roots.push(...buildTagGroups(entries, this.colorStore, this.filter, this.groupsCollapsed));
    return roots;
  }
}

function byLabel(a: SavedWorkspace, b: SavedWorkspace): number {
  const pinDelta = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
  if (pinDelta !== 0) return pinDelta;
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

export function isGroupByTagsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('workspaceControl')
    .get<boolean>('groupByTags', true);
}

function buildTagGroups(
  entries: SavedWorkspace[],
  colorStore: TagColorStore,
  filter: FilterState,
  collapsed: boolean
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
    .map(([tag, list]) => new TagGroupTreeItem(tag, [...list].sort(byLabel), colorStore, collapsed));
  if (untagged.length > 0) {
    groups.push(
      new TagGroupTreeItem(UNTAGGED_LABEL, [...untagged].sort(byLabel), colorStore, collapsed)
    );
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

function buildTooltip(entry: SavedWorkspace, isCurrent: boolean, isPinned: boolean): string {
  const lines = [entry.label, entry.path, `Tipo: ${entry.kind}`];
  if (isPinned) {
    lines.push('★ Pinado (aparece sempre no topo)');
  }
  if (isCurrent) {
    lines.push('Workspace atual desta janela');
  }
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
