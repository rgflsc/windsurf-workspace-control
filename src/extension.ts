import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { WorkspaceTreeProvider } from './workspaceProvider';
import { WorkspaceStore } from './workspaceStore';
import { TagColorStore } from './tagColorStore';
import { FilterState } from './filterState';
import { SearchState } from './searchState';
import { GitStatusCache } from './gitStatus';
import { ArchivedVisibilityState } from './archivedState';
import { StatusBarManager } from './statusBar';
import { applyCurrentWorkspaceColor } from './workspaceColor';

export function activate(context: vscode.ExtensionContext): void {
  const store = new WorkspaceStore(context);
  const colorStore = new TagColorStore(context);
  const filter = new FilterState();
  const search = new SearchState();
  const gitStatus = new GitStatusCache();
  const archivedVisibility = new ArchivedVisibilityState();
  const provider = new WorkspaceTreeProvider(
    store,
    filter,
    colorStore,
    search,
    gitStatus,
    archivedVisibility
  );
  const statusBar = new StatusBarManager(store, colorStore);

  const view = vscode.window.createTreeView('workspaceControl.list', {
    treeDataProvider: provider,
    showCollapseAll: false,
    dragAndDropController: provider
  });

  context.subscriptions.push(
    view,
    store,
    colorStore,
    filter,
    search,
    gitStatus,
    archivedVisibility,
    provider,
    statusBar,
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void applyCurrentWorkspaceColor(store);
    }),
    store.onDidChange(() => {
      void applyCurrentWorkspaceColor(store);
    })
  );

  registerCommands(
    context,
    store,
    colorStore,
    filter,
    provider,
    view,
    search,
    gitStatus,
    archivedVisibility
  );

  void applyCurrentWorkspaceColor(store);
}

export function deactivate(): void {
  // no-op
}
