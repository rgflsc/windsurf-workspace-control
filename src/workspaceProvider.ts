import * as vscode from 'vscode';
import { SavedWorkspace, normalizeTags } from './types';
import { WorkspaceStore } from './workspaceStore';
import { TagColorStore } from './tagColorStore';
import { FilterState, UNTAGGED_FILTER_KEY } from './filterState';
import { SearchState } from './searchState';
import { GitStatusCache, GitInfo } from './gitStatus';
import { ArchivedVisibilityState } from './archivedState';
import { findCurrentEntry } from './currentWorkspace';

const DRAG_MIME = 'application/vnd.workspace-control.entry';

const UNTAGGED_LABEL = 'Untagged';
const CURRENT_MARK = '● ';
const PINNED_MARK = '★ ';
const ARCHIVED_MARK = '🗄 ';

export class WorkspaceTreeItem extends vscode.TreeItem {
  public readonly sourceGroupTag: string | null;

  constructor(
    public readonly entry: SavedWorkspace,
    colorStore: TagColorStore,
    isCurrent = false,
    git: GitInfo | null = null,
    sourceGroupTag: string | null = null
  ) {
    const isPinned = !!entry.pinned;
    const isArchived = !!entry.archived;
    const prefix = `${isPinned ? PINNED_MARK : ''}${isArchived ? ARCHIVED_MARK : ''}${isCurrent ? CURRENT_MARK : ''}`;
    super(`${prefix}${entry.label}`, vscode.TreeItemCollapsibleState.None);
    this.id = `ws:${entry.id}`;
    const tags = normalizeTags(entry.tags);
    const markers: string[] = [];
    if (isCurrent) markers.push('atual');
    if (isPinned) markers.push('pinado');
    if (isArchived) markers.push('arquivado');
    if (git) markers.push(`${git.branch}${git.dirty ? '●' : ''}`);
    // Description shows only markers. Path, tags and notes are in the tooltip;
    // tag color remains visible via the item icon.
    this.description = markers.join(' · ');
    this.tooltip = buildTooltip(entry, isCurrent, isPinned, isArchived, git);
    this.contextValue = buildContextValue(isCurrent, isPinned, isArchived);
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
    this.sourceGroupTag = sourceGroupTag;
  }
}

function buildContextValue(
  isCurrent: boolean,
  isPinned: boolean,
  isArchived: boolean
): string {
  let value = 'workspaceEntry';
  if (isPinned) value += '.pinned';
  if (isCurrent) value += '.current';
  if (isArchived) value += '.archived';
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

export class SearchIndicatorTreeItem extends vscode.TreeItem {
  constructor(query: string) {
    super(`Buscando: ${query}`, vscode.TreeItemCollapsibleState.None);
    this.id = 'search:indicator';
    this.contextValue = 'searchIndicator';
    this.iconPath = new vscode.ThemeIcon('search');
    this.command = {
      command: 'workspaceControl.clearSearch',
      title: 'Limpar busca',
      arguments: []
    };
    this.tooltip = 'Clique para limpar a busca';
  }
}

export type WorkspaceTreeNode =
  | WorkspaceTreeItem
  | TagGroupTreeItem
  | FilterIndicatorTreeItem
  | SearchIndicatorTreeItem;

export class WorkspaceTreeProvider
  implements
    vscode.TreeDataProvider<WorkspaceTreeNode>,
    vscode.TreeDragAndDropController<WorkspaceTreeNode>,
    vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    WorkspaceTreeNode | undefined | void
  >();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public readonly dragMimeTypes = [DRAG_MIME];
  public readonly dropMimeTypes = [DRAG_MIME];

  private readonly disposables: vscode.Disposable[] = [];

  private groupsCollapsed = false;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly filter: FilterState,
    private readonly colorStore: TagColorStore,
    private readonly search: SearchState,
    private readonly gitStatus: GitStatusCache,
    private readonly archivedVisibility: ArchivedVisibilityState
  ) {
    vscode.commands.executeCommand(
      'setContext',
      'workspaceControl.groupsCollapsed',
      false
    );
    this.disposables.push(
      store.onDidChange(() => {
        this.gitStatus.invalidate();
        this.fire();
      }),
      filter.onDidChange(() => this.fire()),
      search.onDidChange(() => this.fire()),
      colorStore.onDidChange(() => this.fire()),
      gitStatus.onDidChange(() => this.fire()),
      archivedVisibility.onDidChange(() => this.fire()),
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
      const sourceTag = element.tag === UNTAGGED_LABEL ? null : element.tag;
      return [...element.entries]
        .sort(byLabel)
        .map(
          (e) =>
            new WorkspaceTreeItem(
              e,
              this.colorStore,
              e.id === currentId,
              this.gitStatus.get(e),
              sourceTag
            )
        );
    }
    if (element) {
      return [];
    }
    const entries = this.store.getAll().filter((e) =>
      (this.archivedVisibility.isVisible || !e.archived) &&
      this.filter.matches(normalizeTags(e.tags).map((t) => t.toLowerCase())) &&
      this.search.matches(e.label, e.path)
    );

    const roots: WorkspaceTreeNode[] = [];
    if (this.search.isActive) {
      roots.push(new SearchIndicatorTreeItem(this.search.query));
    }
    if (this.filter.isActive) {
      roots.push(new FilterIndicatorTreeItem(this.filter.getActiveLabels()));
    }

    if (!isGroupByTagsEnabled()) {
      const sorted = [...entries].sort(byLabel);
      for (const entry of sorted) {
        roots.push(
          new WorkspaceTreeItem(
            entry,
            this.colorStore,
            entry.id === currentId,
            this.gitStatus.get(entry)
          )
        );
      }
      return roots;
    }
    roots.push(...buildTagGroups(entries, this.colorStore, this.filter, this.groupsCollapsed));
    return roots;
  }

  public handleDrag(
    source: readonly WorkspaceTreeNode[],
    dataTransfer: vscode.DataTransfer
  ): void {
    const payload = source
      .filter((n): n is WorkspaceTreeItem => n instanceof WorkspaceTreeItem)
      .map((n) => ({ id: n.entry.id, sourceTag: n.sourceGroupTag }));
    if (payload.length === 0) {
      return;
    }
    dataTransfer.set(DRAG_MIME, new vscode.DataTransferItem(JSON.stringify(payload)));
  }

  public async handleDrop(
    target: WorkspaceTreeNode | undefined,
    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
    const item = dataTransfer.get(DRAG_MIME);
    if (!item) {
      return;
    }
    let payload: Array<{ id: string; sourceTag: string | null }>;
    try {
      payload = parseDragPayload(await item.asString());
    } catch {
      return;
    }
    if (payload.length === 0) {
      return;
    }
    const targetTag = dropTargetTag(target);
    if (targetTag === undefined) {
      return;
    }
    for (const { id, sourceTag } of payload) {
      const entry = this.store.get(id);
      if (!entry) continue;
      const nextTags = computeDroppedTags(
        normalizeTags(entry.tags),
        sourceTag,
        targetTag
      );
      await this.store.update(id, { tags: nextTags });
    }
  }
}

function parseDragPayload(
  raw: string
): Array<{ id: string; sourceTag: string | null }> {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  const out: Array<{ id: string; sourceTag: string | null }> = [];
  for (const item of parsed) {
    if (item && typeof item === 'object' && typeof (item as { id: unknown }).id === 'string') {
      const sourceTag = (item as { sourceTag: unknown }).sourceTag;
      out.push({
        id: (item as { id: string }).id,
        sourceTag: typeof sourceTag === 'string' ? sourceTag : null
      });
    }
  }
  return out;
}

function computeDroppedTags(
  currentTags: string[],
  sourceTag: string | null,
  targetTag: string | null
): string[] {
  if (targetTag === null) {
    return [];
  }
  if (currentTags.length === 0) {
    return normalizeTags([targetTag]);
  }
  const sourceLower = sourceTag?.toLowerCase();
  const targetLower = targetTag.toLowerCase();
  if (sourceLower) {
    const replaced = currentTags.map((t) =>
      t.toLowerCase() === sourceLower ? targetTag : t
    );
    if (!replaced.some((t) => t.toLowerCase() === sourceLower)) {
      return normalizeTags(replaced);
    }
    if (!currentTags.some((t) => t.toLowerCase() === sourceLower)) {
      replaced.push(targetTag);
    }
    return normalizeTags(replaced);
  }
  if (currentTags.some((t) => t.toLowerCase() === targetLower)) {
    return normalizeTags(currentTags);
  }
  const [, ...rest] = currentTags;
  return normalizeTags([targetTag, ...rest]);
}

function dropTargetTag(target: WorkspaceTreeNode | undefined): string | null | undefined {
  if (target instanceof TagGroupTreeItem) {
    return target.tag === UNTAGGED_LABEL ? null : target.tag;
  }
  if (target instanceof WorkspaceTreeItem) {
    const tags = normalizeTags(target.entry.tags);
    return tags.length > 0 ? tags[0] : null;
  }
  return undefined;
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

function buildTooltip(
  entry: SavedWorkspace,
  isCurrent: boolean,
  isPinned: boolean,
  isArchived: boolean,
  git: GitInfo | null
): string {
  const lines: string[] = [entry.path];
  if (isPinned) {
    lines.push('★ Pinado (aparece sempre no topo)');
  }
  if (isArchived) {
    lines.push('🗄 Arquivado');
  }
  if (isCurrent) {
    lines.push('Workspace atual desta janela');
  }
  if (git) {
    lines.push(`Git: ${git.branch}${git.dirty ? ' (modificado)' : ''}`);
    if (git.remoteUrl) {
      lines.push(`Remote: ${git.remoteUrl}`);
    }
  }
  if (entry.lastOpenedAt) {
    lines.push(`Último acesso: ${new Date(entry.lastOpenedAt).toLocaleString()}`);
  }
  const notes = (entry.notes ?? '').trim();
  if (notes) {
    lines.push('', notes);
  }
  return lines.join('\n');
}
