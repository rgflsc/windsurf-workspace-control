import * as vscode from 'vscode';
import { SavedWorkspace, normalizeTags } from './types';
import { WorkspaceStore } from './workspaceStore';
import { TagColorStore } from './tagColorStore';
import { findCurrentEntry } from './currentWorkspace';

/**
 * Manages a StatusBarItem that reflects the currently-open workspace
 * (matched against the saved list by path) with its label and tags.
 */
export class StatusBarManager implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: WorkspaceStore,
    private readonly colorStore: TagColorStore
  ) {
    this.item = vscode.window.createStatusBarItem(
      'workspaceControl.status',
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.name = 'Workspace Control';
    this.item.command = 'workspaceControl.quickSwitch';

    const refresh = (): void => this.refresh();
    this.disposables.push(
      store.onDidChange(refresh),
      colorStore.onDidChange(refresh),
      vscode.workspace.onDidChangeWorkspaceFolders(refresh),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('workspaceControl.showStatusBar')) {
          refresh();
        }
      })
    );
    this.refresh();
  }

  private refresh(): void {
    const enabled = vscode.workspace
      .getConfiguration('workspaceControl')
      .get<boolean>('showStatusBar', true);
    if (!enabled) {
      this.item.hide();
      return;
    }

    const match = findCurrentEntry(this.store);
    if (!match) {
      this.item.hide();
      return;
    }

    const tags = normalizeTags(match.tags);
    const iconId = match.kind === 'workspaceFile' ? 'multiple-windows' : 'folder';
    const color = tags.length > 0 ? this.colorStore.getThemeColor(tags[0]) : undefined;

    const tagSuffix = tags.length > 0 ? `  ${tags.map((t) => `#${t}`).join(' ')}` : '';
    this.item.text = `$(${iconId}) ${match.label}${tagSuffix}`;
    this.item.color = color;
    this.item.tooltip = buildTooltip(match, tags);
    this.item.show();
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.item.dispose();
  }
}

function buildTooltip(entry: SavedWorkspace, tags: readonly string[]): string {
  const lines = [`Workspace atual: ${entry.label}`, entry.path];
  if (tags.length > 0) {
    lines.push(`Tags: ${tags.join(', ')}`);
  }
  lines.push('', 'Clique para alternar workspace');
  return lines.join('\n');
}
