import * as vscode from 'vscode';

/**
 * Volatile (per-session) flag controlling whether archived workspaces are
 * shown in the tree / QuickPick. Default: hidden.
 */
export class ArchivedVisibilityState implements vscode.Disposable {
  private visible = false;

  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  public get isVisible(): boolean {
    return this.visible;
  }

  public async toggle(): Promise<void> {
    await this.set(!this.visible);
  }

  public async set(next: boolean): Promise<void> {
    if (this.visible === next) {
      return;
    }
    this.visible = next;
    this.onDidChangeEmitter.fire();
    await vscode.commands.executeCommand(
      'setContext',
      'workspaceControl.archivedVisible',
      this.visible
    );
  }

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
