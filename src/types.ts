export type WorkspaceKind = 'folder' | 'workspaceFile';

export interface SavedWorkspace {
  id: string;
  label: string;
  /** Absolute filesystem path to a folder or to a `.code-workspace` file. */
  path: string;
  kind: WorkspaceKind;
  /** ISO timestamp of last time this workspace was opened via the extension. */
  lastOpenedAt?: string;
  /** Free-form grouping tags. Normalized to trimmed, non-empty strings. */
  tags?: string[];
  /** When true, the workspace is pinned to the top of its group/flat list. */
  pinned?: boolean;
  /** When true, the workspace is hidden from the tree/QuickPick unless
   *  the "Show archived" toggle is active. */
  archived?: boolean;
  /** Free-form user notes shown in the hover tooltip. */
  notes?: string;
  /** Optional palette color id (see tagColorStore.TAG_COLOR_OPTIONS) used to
   *  tint the editor's UI (titleBar + activityBar) while the workspace is open. */
  color?: string;
}

export const UNTAGGED = '__untagged__';

export function normalizeTags(tags: readonly string[] | undefined): string[] {
  if (!tags) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    if (seen.has(trimmed.toLowerCase())) {
      continue;
    }
    seen.add(trimmed.toLowerCase());
    out.push(trimmed);
  }
  return out;
}
