import * as vscode from 'vscode';
import { WorkspaceStore } from './workspaceStore';
import { findCurrentEntry } from './currentWorkspace';

/**
 * Palette of concrete hex colors used to tint a workspace's UI (titleBar,
 * activityBar, statusBar). Keys mirror the ids available in tag colors, so
 * the same labels can be reused in the pick UI.
 */
export const WORKSPACE_COLOR_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
  hex: string | null;
}> = [
  { id: 'none', label: 'Sem cor', hex: null },
  { id: 'red', label: 'Vermelho', hex: '#B3261E' },
  { id: 'orange', label: 'Laranja', hex: '#C25A00' },
  { id: 'yellow', label: 'Amarelo', hex: '#8A6D00' },
  { id: 'green', label: 'Verde', hex: '#1F6F43' },
  { id: 'blue', label: 'Azul', hex: '#0A5C9E' },
  { id: 'purple', label: 'Roxo', hex: '#6F42C1' },
  { id: 'teal', label: 'Ciano', hex: '#007A7A' },
  { id: 'pink', label: 'Rosa', hex: '#BF3D87' },
  { id: 'gray', label: 'Cinza', hex: '#4B5563' }
];

const MARKER_PREFIX = '__workspaceControl';

const COLOR_KEYS = [
  'titleBar.activeBackground',
  'titleBar.activeForeground',
  'titleBar.inactiveBackground',
  'titleBar.inactiveForeground',
  'activityBar.background',
  'activityBar.foreground',
  'statusBar.background',
  'statusBar.foreground'
] as const;

/**
 * Apply the color customizations of the currently-open saved workspace (if
 * any). Writes to the workspace-level `workbench.colorCustomizations`,
 * replacing any previously-applied marker set by this extension.
 */
export async function applyCurrentWorkspaceColor(store: WorkspaceStore): Promise<void> {
  const current = findCurrentEntry(store);
  await writeWorkspaceColor(current?.color);
}

async function writeWorkspaceColor(colorId: string | undefined): Promise<void> {
  if (!hasWorkspace()) {
    return;
  }
  const cfg = vscode.workspace.getConfiguration('workbench');
  // Read the workspace-scoped value only — `cfg.get()` returns the merged value
  // across user/workspace/folder scopes, which would copy unrelated user-level
  // customizations into the workspace settings file.
  const inspected = cfg.inspect<Record<string, string>>('colorCustomizations');
  const existing = inspected?.workspaceValue ?? {};
  const hadMarker = Object.keys(existing).some((k) => k.startsWith(MARKER_PREFIX));
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(existing)) {
    if (key.startsWith(MARKER_PREFIX)) {
      continue;
    }
    // If the extension had previously applied a color, its COLOR_KEYS entries
    // in `existing` were written by us. Drop them before computing the next
    // state so switching to a different (or no) workspace color clears the
    // previous tint.
    if (hadMarker && (COLOR_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    next[key] = value;
  }
  const opt = colorId
    ? WORKSPACE_COLOR_OPTIONS.find((o) => o.id === colorId)
    : undefined;
  if (opt?.hex) {
    const accent = opt.hex;
    const fg = pickForeground(accent);
    next[`${MARKER_PREFIX}.id`] = opt.id;
    next['titleBar.activeBackground'] = accent;
    next['titleBar.activeForeground'] = fg;
    next['titleBar.inactiveBackground'] = accent;
    next['titleBar.inactiveForeground'] = fg;
    next['activityBar.background'] = accent;
    next['activityBar.foreground'] = fg;
    next['statusBar.background'] = accent;
    next['statusBar.foreground'] = fg;
  }
  if (shallowEqual(existing, next)) {
    return;
  }
  await cfg.update(
    'colorCustomizations',
    next,
    vscode.ConfigurationTarget.Workspace
  );
}

function hasWorkspace(): boolean {
  return Boolean(
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
  );
}

function pickForeground(hex: string): string {
  const parsed = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!parsed) {
    return '#ffffff';
  }
  const n = parseInt(parsed[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Rec. 709 luminance; cutoff ~0.55 keeps darker accents with white text.
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.55 ? '#1f1f1f' : '#ffffff';
}

function shallowEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
