import * as vscode from 'vscode';
import {
  SavedWorkspace,
  expandTagsWithAncestors,
  normalizeTags,
  TAG_HIERARCHY_SEPARATOR,
  tagSegments
} from './types';
import { WorkspaceStore } from './workspaceStore';
import { TagColorStore } from './tagColorStore';
import { FilterState } from './filterState';
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

/**
 * A node in the tag-group tree. Holds entries tagged exactly with `tag` (the
 * full path, e.g. `frontend/web`) plus any nested children that share the
 * same prefix. The tree view label shows only the leaf segment (e.g. `web`)
 * so nested groups read naturally; the full path stays accessible via the
 * `tag` field for filtering, drag-and-drop and command targeting.
 */
export class TagGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly tag: string,
    public readonly entries: SavedWorkspace[],
    public readonly children: TagGroupTreeItem[],
    colorStore: TagColorStore,
    collapsed = false
  ) {
    const segments = tag === UNTAGGED_LABEL ? [UNTAGGED_LABEL] : tagSegments(tag);
    const label = segments[segments.length - 1] ?? tag;
    super(
      label,
      collapsed
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.Expanded
    );
    this.id = `tag:${collapsed ? 'c' : 'e'}:${tag.toLowerCase()}`;
    // Show direct count and, if relevant, total count including descendants —
    // useful for parents that group sub-tagged items but have no direct ones.
    const totalDescendants = countDescendantEntries(this);
    this.description =
      totalDescendants > entries.length
        ? `${entries.length} (${totalDescendants})`
        : `${entries.length}`;
    this.contextValue = tag === UNTAGGED_LABEL ? 'untaggedGroup' : 'tagGroup';
    const iconId = tag === UNTAGGED_LABEL ? 'question' : 'tag';
    const color = tag === UNTAGGED_LABEL ? undefined : colorStore.getThemeColor(tag);
    this.iconPath = color ? new vscode.ThemeIcon(iconId, color) : new vscode.ThemeIcon(iconId);
    if (segments.length > 1) {
      // Tooltip surfaces the full path for parents whose label is just the
      // leaf segment (e.g. label "web", tooltip "frontend/web").
      this.tooltip = tag;
    }
  }
}

function countDescendantEntries(group: TagGroupTreeItem): number {
  let total = group.entries.length;
  for (const child of group.children) {
    total += countDescendantEntries(child);
  }
  return total;
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
      const childGroups = element.children;
      const items = [...element.entries].sort(byLabel).map(
        (e) =>
          new WorkspaceTreeItem(
            e,
            this.colorStore,
            e.id === currentId,
            this.gitStatus.get(e),
            sourceTag
          )
      );
      return [...childGroups, ...items];
    }
    if (element) {
      return [];
    }
    const entries = this.store.getAll().filter((e) => {
      if (!this.archivedVisibility.isVisible && e.archived) return false;
      const expanded = expandTagsWithAncestors(normalizeTags(e.tags)).map((t) => t.toLowerCase());
      // expandTagsWithAncestors keeps the empty-list case as empty, so the
      // existing UNTAGGED_FILTER_KEY branch in FilterState.matches still
      // covers untagged entries correctly.
      return this.filter.matches(expanded) && this.search.matches(e.label, e.path);
    });

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

interface RawNode {
  fullPath: string;
  segment: string;
  directEntries: SavedWorkspace[];
  children: Map<string, RawNode>;
}

function makeRawNode(fullPath: string, segment: string): RawNode {
  return { fullPath, segment, directEntries: [], children: new Map() };
}

function buildTagGroups(
  entries: SavedWorkspace[],
  colorStore: TagColorStore,
  filter: FilterState,
  collapsed: boolean
): TagGroupTreeItem[] {
  const activeFilterTags = new Set(filter.getActive());
  const roots = new Map<string, RawNode>();
  const untagged: SavedWorkspace[] = [];
  for (const entry of entries) {
    const tags = normalizeTags(entry.tags);
    if (tags.length === 0) {
      untagged.push(entry);
      continue;
    }
    for (const tag of tags) {
      const segments = tagSegments(tag);
      if (segments.length === 0) continue;
      // Filter pruning: when a filter is active, only walk subtrees whose
      // path matches the filter. We accept the tag if ANY of its prefixes
      // (including itself) is in the active set, so filtering by `frontend`
      // keeps `frontend/web` and `frontend/web/react`.
      if (filter.isActive) {
        let matched = false;
        for (let i = 1; i <= segments.length; i++) {
          const prefix = segments.slice(0, i).join(TAG_HIERARCHY_SEPARATOR).toLowerCase();
          if (activeFilterTags.has(prefix)) {
            matched = true;
            break;
          }
        }
        if (!matched) {
          continue;
        }
      }
      let parentMap = roots;
      let accumulated: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        accumulated = [...accumulated, seg];
        const fullPath = accumulated.join(TAG_HIERARCHY_SEPARATOR);
        const key = seg.toLowerCase();
        let node = parentMap.get(key);
        if (!node) {
          node = makeRawNode(fullPath, seg);
          parentMap.set(key, node);
        }
        if (i === segments.length - 1) {
          node.directEntries.push(entry);
        }
        parentMap = node.children;
      }
    }
  }
  const topGroups = [...roots.values()]
    .sort(byNodeSegment)
    .map((node) => toTagGroupTreeItem(node, colorStore, collapsed));
  if (untagged.length > 0) {
    topGroups.push(
      new TagGroupTreeItem(
        UNTAGGED_LABEL,
        [...untagged].sort(byLabel),
        [],
        colorStore,
        collapsed
      )
    );
  }
  return topGroups;
}

function byNodeSegment(a: RawNode, b: RawNode): number {
  return a.segment.localeCompare(b.segment, undefined, { sensitivity: 'base' });
}

function toTagGroupTreeItem(
  node: RawNode,
  colorStore: TagColorStore,
  collapsed: boolean
): TagGroupTreeItem {
  const children = [...node.children.values()]
    .sort(byNodeSegment)
    .map((child) => toTagGroupTreeItem(child, colorStore, collapsed));
  const sortedEntries = [...node.directEntries].sort(byLabel);
  return new TagGroupTreeItem(node.fullPath, sortedEntries, children, colorStore, collapsed);
}

function buildTooltip(
  entry: SavedWorkspace,
  isCurrent: boolean,
  isPinned: boolean,
  isArchived: boolean,
  git: GitInfo | null
): string {
  const lines: string[] = [entry.path.toLowerCase()];
  if (isPinned) {
    lines.push('★ Pinado (aparece sempre no topo)');
  }
  if (isArchived) {
    lines.push('🗄 Arquivado');
  }
  if (isCurrent) {
    lines.push('Workspace atual desta janela');
  }
  if (git?.remoteUrl) {
    lines.push(`Remote: ${git.remoteUrl}`);
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
