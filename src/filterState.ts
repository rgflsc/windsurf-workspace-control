import * as vscode from 'vscode';

/** Special marker for the "Untagged" pseudo-tag in the filter. */
export const UNTAGGED_FILTER_KEY = '__untagged__';

/**
 * Volatile (per-session) state holding the active tag filter for the tree view.
 * An empty set means "show everything".
 */
export class FilterState implements vscode.Disposable {
  private activeTags = new Set<string>();

  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  public get isActive(): boolean {
    return this.activeTags.size > 0;
  }

  /** Returns the lowercased tag keys currently active. */
  public getActive(): string[] {
    return [...this.activeTags];
  }

  /** Returns the display labels of the active filter (original case preserved from input). */
  private readonly displayLabels = new Map<string, string>();

  public getActiveLabels(): string[] {
    return this.getActive().map((t) => this.displayLabels.get(t) ?? t);
  }

  public set(tags: readonly string[]): void {
    this.activeTags = new Set();
    this.displayLabels.clear();
    for (const raw of tags) {
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      this.activeTags.add(key);
      this.displayLabels.set(key, trimmed);
    }
    this.emitChange();
  }

  public clear(): void {
    if (!this.isActive) {
      return;
    }
    this.activeTags.clear();
    this.displayLabels.clear();
    this.emitChange();
  }

  /**
   * Returns true if a workspace (represented by its lowercased tag list) passes
   * the current filter. An empty filter passes everything.
   */
  public matches(entryTagsLower: readonly string[]): boolean {
    if (!this.isActive) {
      return true;
    }
    if (this.activeTags.has(UNTAGGED_FILTER_KEY) && entryTagsLower.length === 0) {
      return true;
    }
    for (const tag of entryTagsLower) {
      if (this.activeTags.has(tag)) {
        return true;
      }
    }
    return false;
  }

  private emitChange(): void {
    this.onDidChangeEmitter.fire();
    void vscode.commands.executeCommand(
      'setContext',
      'workspaceControl.filterActive',
      this.isActive
    );
  }

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
