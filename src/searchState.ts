import * as vscode from 'vscode';

/**
 * Volatile (per-session) search query for the tree view. Matches a workspace
 * when its label or path contains the term (case-insensitive).
 */
export class SearchState implements vscode.Disposable {
  private term = '';

  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  public get isActive(): boolean {
    return this.term.length > 0;
  }

  public get query(): string {
    return this.term;
  }

  public set(next: string): void {
    const normalized = next.trim();
    if (normalized === this.term) {
      return;
    }
    this.term = normalized;
    this.emitChange();
  }

  public clear(): void {
    if (!this.isActive) {
      return;
    }
    this.term = '';
    this.emitChange();
  }

  public matches(entryLabel: string, entryPath: string): boolean {
    if (!this.isActive) {
      return true;
    }
    const needle = this.term.toLowerCase();
    return (
      entryLabel.toLowerCase().includes(needle) ||
      entryPath.toLowerCase().includes(needle)
    );
  }

  private emitChange(): void {
    this.onDidChangeEmitter.fire();
    void vscode.commands.executeCommand(
      'setContext',
      'workspaceControl.searchActive',
      this.isActive
    );
  }

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
