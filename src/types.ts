export type WorkspaceKind = 'folder' | 'workspaceFile';

export interface SavedWorkspace {
  id: string;
  label: string;
  /** Absolute filesystem path to a folder or to a `.code-workspace` file. */
  path: string;
  kind: WorkspaceKind;
  /** ISO timestamp of last time this workspace was opened via the extension. */
  lastOpenedAt?: string;
}
