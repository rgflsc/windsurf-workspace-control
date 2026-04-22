import * as vscode from 'vscode';
import { SavedWorkspace } from './types';
import { WorkspaceStore } from './workspaceStore';

export function findCurrentEntry(store: WorkspaceStore): SavedWorkspace | undefined {
  const wsFile = vscode.workspace.workspaceFile;
  const folders = vscode.workspace.workspaceFolders ?? [];
  const entries = store.getAll();

  if (wsFile && wsFile.scheme === 'file') {
    const hit = entries.find(
      (e) => e.kind === 'workspaceFile' && samePath(e.path, wsFile.fsPath)
    );
    if (hit) {
      return hit;
    }
  }
  if (folders.length === 1) {
    return entries.find(
      (e) => e.kind === 'folder' && samePath(e.path, folders[0].uri.fsPath)
    );
  }
  return undefined;
}

export function samePath(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  const normA = a.replace(/[\\/]+$/, '');
  const normB = b.replace(/[\\/]+$/, '');
  if (process.platform === 'win32') {
    return normA.toLowerCase() === normB.toLowerCase();
  }
  return normA === normB;
}
