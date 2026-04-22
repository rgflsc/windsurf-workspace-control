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
