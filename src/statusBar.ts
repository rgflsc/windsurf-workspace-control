import * as vscode from 'vscode';
import { SavedWorkspace, normalizeTags } from './types';
import { WorkspaceStore } from './workspaceStore';
import { TagColorStore } from './tagColorStore';
import { findCurrentEntry } from './currentWorkspace';

/**
 * Status bar item for the currently-open saved workspace. Shows only the
 * workspace label, colored with the ThemeColor of its first tag (when set).
 * Hidden when the open workspace is not in the saved list, or when
 * `workspaceControl.showStatusBar` is disabled.
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
    const color = tags.length > 0 ? this.colorStore.getThemeColor(tags[0]) : undefined;

    this.item.text = match.label;
    this.item.color = color;
    this.item.tooltip = buildTooltip(match);
    this.item.show();
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.item.dispose();
  }
}

function buildTooltip(entry: SavedWorkspace): string {
  return [`Workspace atual: ${entry.label}`, entry.path, '', 'Clique para alternar workspace'].join('\n');
}
