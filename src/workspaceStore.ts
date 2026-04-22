import * as vscode from 'vscode';
import { SavedWorkspace } from './types';

const STORAGE_KEY = 'workspaceControl.savedWorkspaces';

export class WorkspaceStore {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private get memento(): vscode.Memento {
    const scope = vscode.workspace
      .getConfiguration('workspaceControl')
      .get<string>('storageScope', 'global');
    return scope === 'workspace' ? this.context.workspaceState : this.context.globalState;
  }

  public getAll(): SavedWorkspace[] {
    const raw = this.memento.get<SavedWorkspace[]>(STORAGE_KEY, []);
    return [...raw];
  }

  public get(id: string): SavedWorkspace | undefined {
    return this.getAll().find((w) => w.id === id);
  }

  public async setAll(list: SavedWorkspace[]): Promise<void> {
    await this.memento.update(STORAGE_KEY, list);
    this.onDidChangeEmitter.fire();
  }

  public async add(entry: SavedWorkspace): Promise<void> {
    const list = this.getAll();
    if (list.some((w) => w.path === entry.path)) {
      throw new Error(`Workspace já existe: ${entry.path}`);
    }
    list.push(entry);
    await this.setAll(list);
  }

  public async remove(id: string): Promise<void> {
    const list = this.getAll().filter((w) => w.id !== id);
    await this.setAll(list);
  }

  public async update(id: string, patch: Partial<SavedWorkspace>): Promise<void> {
    const list = this.getAll();
    const idx = list.findIndex((w) => w.id === id);
    if (idx === -1) {
      return;
    }
    list[idx] = { ...list[idx], ...patch, id: list[idx].id };
    await this.setAll(list);
  }

  public async move(id: string, delta: number): Promise<void> {
    const list = this.getAll();
    const idx = list.findIndex((w) => w.id === id);
    if (idx === -1) {
      return;
    }
    const target = idx + delta;
    if (target < 0 || target >= list.length) {
      return;
    }
    const [item] = list.splice(idx, 1);
    list.splice(target, 0, item);
    await this.setAll(list);
  }

  public async touch(id: string): Promise<void> {
    await this.update(id, { lastOpenedAt: new Date().toISOString() });
  }

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
