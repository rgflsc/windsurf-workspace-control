import * as vscode from 'vscode';
import { SavedWorkspace } from './types';
import { WorkspaceStore } from './workspaceStore';
import { GitStatusCache } from './gitStatus';
import { findCurrentEntry } from './currentWorkspace';

/**
 * Manages a StatusBarItem showing only the git branch / dirty state of the
 * currently-open saved workspace. The item is hidden when:
 *  - the feature is disabled via `workspaceControl.showStatusBar`;
 *  - the open workspace is not in the saved list; or
 *  - the workspace is not a git repository.
 */
export class StatusBarManager implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: WorkspaceStore,
    private readonly gitStatus: GitStatusCache
  ) {
    this.item = vscode.window.createStatusBarItem(
      'workspaceControl.status',
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.name = 'Workspace Control — Git';
    this.item.command = 'workspaceControl.quickSwitch';

    const refresh = (): void => this.refresh();
    this.disposables.push(
      store.onDidChange(refresh),
      gitStatus.onDidChange(refresh),
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

    const git = this.gitStatus.get(match);
    if (!git) {
      this.item.hide();
      return;
    }

    this.item.text = `$(git-branch) ${git.branch}${git.dirty ? '●' : ''}`;
    this.item.tooltip = buildTooltip(match, git.branch, git.dirty);
    this.item.show();
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.item.dispose();
  }
}

function buildTooltip(entry: SavedWorkspace, branch: string, dirty: boolean): string {
  const lines = [
    `Workspace atual: ${entry.label}`,
    entry.path,
    `Git: ${branch}${dirty ? ' (modificado)' : ''}`,
    '',
    'Clique para alternar workspace'
  ];
  return lines.join('\n');
}
