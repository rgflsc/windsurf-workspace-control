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

/**
 * Hierarchy separator used inside a tag string to express sub-tags. A tag
 * like `frontend/web/react` represents three nested levels in the tree view.
 * The full string is still stored (and matched) verbatim — splitting only
 * happens for presentation and filter expansion.
 */
export const TAG_HIERARCHY_SEPARATOR = '/';

/**
 * Splits a tag like `frontend/web/react` into its segments, dropping empty
 * segments produced by leading/trailing/consecutive separators. Returns an
 * empty array for tags that contain no usable segment.
 */
export function tagSegments(tag: string): string[] {
  return tag.split(TAG_HIERARCHY_SEPARATOR).map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * For a list of tags like `['frontend/web', 'admin']`, returns the tags plus
 * every ancestor prefix (`['frontend', 'frontend/web', 'admin']`). Used by
 * the tree view to make filtering by a parent tag include its descendants.
 * Output preserves insertion order and drops case-insensitive duplicates.
 */
export function expandTagsWithAncestors(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const segs = tagSegments(tag);
    for (let i = 1; i <= segs.length; i++) {
      const prefix = segs.slice(0, i).join(TAG_HIERARCHY_SEPARATOR);
      const lower = prefix.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(prefix);
    }
  }
  return out;
}

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
