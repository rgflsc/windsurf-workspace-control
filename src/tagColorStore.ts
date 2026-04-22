import * as vscode from 'vscode';

/**
 * Color options users can assign to tags. Values are VS Code ThemeColor ids
 * that are guaranteed to exist in any theme. `none` clears the color.
 */
export const TAG_COLOR_OPTIONS: ReadonlyArray<{ id: string; label: string; themeColor: string | null }> = [
  { id: 'none', label: 'Sem cor', themeColor: null },
  { id: 'red', label: 'Vermelho', themeColor: 'charts.red' },
  { id: 'orange', label: 'Laranja', themeColor: 'charts.orange' },
  { id: 'yellow', label: 'Amarelo', themeColor: 'charts.yellow' },
  { id: 'green', label: 'Verde', themeColor: 'charts.green' },
  { id: 'blue', label: 'Azul', themeColor: 'charts.blue' },
  { id: 'purple', label: 'Roxo', themeColor: 'charts.purple' },
  { id: 'foreground', label: 'Padrão (foreground)', themeColor: 'foreground' },
  { id: 'warning', label: 'Aviso', themeColor: 'editorWarning.foreground' },
  { id: 'error', label: 'Erro', themeColor: 'editorError.foreground' }
];

const STORAGE_KEY = 'workspaceControl.tagColors';

/** Case-insensitive map of tag → colorId (id from TAG_COLOR_OPTIONS). */
export type TagColorMap = Record<string, string>;

export class TagColorStore implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private memento(): vscode.Memento {
    return this.context.globalState;
  }

  private readMap(): TagColorMap {
    const raw = this.memento().get<TagColorMap>(STORAGE_KEY);
    return raw && typeof raw === 'object' ? { ...raw } : {};
  }

  private async writeMap(next: TagColorMap): Promise<void> {
    await this.memento().update(STORAGE_KEY, next);
    this.onDidChangeEmitter.fire();
  }

  public getColorId(tag: string): string | undefined {
    const id = this.readMap()[tag.toLowerCase()];
    return id === 'none' ? undefined : id;
  }

  public getThemeColor(tag: string): vscode.ThemeColor | undefined {
    const colorId = this.getColorId(tag);
    if (!colorId) {
      return undefined;
    }
    const opt = TAG_COLOR_OPTIONS.find((o) => o.id === colorId);
    return opt && opt.themeColor ? new vscode.ThemeColor(opt.themeColor) : undefined;
  }

  public async setColor(tag: string, colorId: string): Promise<void> {
    const next = this.readMap();
    const key = tag.toLowerCase();
    if (colorId === 'none' || !TAG_COLOR_OPTIONS.find((o) => o.id === colorId)) {
      delete next[key];
    } else {
      next[key] = colorId;
    }
    await this.writeMap(next);
  }

  public async clear(tag: string): Promise<void> {
    const next = this.readMap();
    delete next[tag.toLowerCase()];
    await this.writeMap(next);
  }

  /** Drop entries for tags no longer referenced by any workspace. */
  public async pruneUnknown(activeTagsLower: ReadonlySet<string>): Promise<void> {
    const current = this.readMap();
    const next: TagColorMap = {};
    let changed = false;
    for (const [tag, color] of Object.entries(current)) {
      if (activeTagsLower.has(tag)) {
        next[tag] = color;
      } else {
        changed = true;
      }
    }
    if (changed) {
      await this.writeMap(next);
    }
  }

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
