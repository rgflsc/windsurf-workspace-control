import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { WorkspaceTreeProvider } from './workspaceProvider';
import { WorkspaceStore } from './workspaceStore';

export function activate(context: vscode.ExtensionContext): void {
  const store = new WorkspaceStore(context);
  const provider = new WorkspaceTreeProvider(store);

  const view = vscode.window.createTreeView('workspaceControl.list', {
    treeDataProvider: provider,
    showCollapseAll: false
  });

  context.subscriptions.push(view, store, provider);

  registerCommands(context, store);
}

export function deactivate(): void {
  // no-op
}
