import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { WorkspaceTreeProvider } from './workspaceProvider';
import { WorkspaceStore } from './workspaceStore';
import { TagColorStore } from './tagColorStore';
import { FilterState } from './filterState';
import { StatusBarManager } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const store = new WorkspaceStore(context);
  const colorStore = new TagColorStore(context);
  const filter = new FilterState();
  const provider = new WorkspaceTreeProvider(store, filter, colorStore);
  const statusBar = new StatusBarManager(store, colorStore);

  const view = vscode.window.createTreeView('workspaceControl.list', {
    treeDataProvider: provider,
    showCollapseAll: true
  });

  context.subscriptions.push(view, store, colorStore, filter, provider, statusBar);

  registerCommands(context, store, colorStore, filter, provider, view);
}

export function deactivate(): void {
  // no-op
}
