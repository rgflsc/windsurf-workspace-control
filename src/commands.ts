import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SavedWorkspace } from './types';
import { WorkspaceStore } from './workspaceStore';
import { WorkspaceTreeItem } from './workspaceProvider';

type OpenMode = 'sameWindow' | 'newWindow' | 'ask';

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function detectKind(fsPath: string): SavedWorkspace['kind'] | undefined {
  try {
    const stat = fs.statSync(fsPath);
    if (stat.isDirectory()) {
      return 'folder';
    }
    if (stat.isFile() && fsPath.endsWith('.code-workspace')) {
      return 'workspaceFile';
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function defaultLabelFor(fsPath: string, kind: SavedWorkspace['kind']): string {
  const base = path.basename(fsPath);
  if (kind === 'workspaceFile') {
    return base.replace(/\.code-workspace$/, '');
  }
  return base;
}

async function openEntry(
  store: WorkspaceStore,
  entry: SavedWorkspace,
  forceMode?: OpenMode
): Promise<void> {
  const mode = forceMode ?? getDefaultOpenMode();
  let forceNewWindow: boolean;
  if (mode === 'sameWindow') {
    forceNewWindow = false;
  } else if (mode === 'newWindow') {
    forceNewWindow = true;
  } else {
    const pick = await vscode.window.showQuickPick(
      [
        { label: '$(arrow-right) Abrir nesta janela', value: false },
        { label: '$(empty-window) Abrir em nova janela', value: true }
      ],
      { placeHolder: `Como abrir "${entry.label}"?` }
    );
    if (!pick) {
      return;
    }
    forceNewWindow = pick.value;
  }

  const uri = vscode.Uri.file(entry.path);
  await store.touch(entry.id);
  await vscode.commands.executeCommand('vscode.openFolder', uri, {
    forceNewWindow,
    forceReuseWindow: !forceNewWindow
  });
}

function getDefaultOpenMode(): OpenMode {
  const cfg = vscode.workspace.getConfiguration('workspaceControl');
  const raw = cfg.get<string>('defaultOpenBehavior', 'ask');
  return raw === 'sameWindow' || raw === 'newWindow' ? raw : 'ask';
}

export function registerCommands(
  context: vscode.ExtensionContext,
  store: WorkspaceStore
): void {
  const register = (cmd: string, handler: (...args: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(cmd, handler));
  };

  register('workspaceControl.openEntry', async (arg: unknown) => {
    const entry = coerceEntry(arg);
    if (!entry) {
      return;
    }
    await openEntry(store, entry);
  });

  register('workspaceControl.openInSameWindow', async (arg: unknown) => {
    const entry = coerceEntry(arg);
    if (!entry) {
      return;
    }
    await openEntry(store, entry, 'sameWindow');
  });

  register('workspaceControl.openInNewWindow', async (arg: unknown) => {
    const entry = coerceEntry(arg);
    if (!entry) {
      return;
    }
    await openEntry(store, entry, 'newWindow');
  });

  register('workspaceControl.quickSwitch', async () => {
    const items = store.getAll();
    if (items.length === 0) {
      const pickAdd = await vscode.window.showInformationMessage(
        'Nenhum workspace salvo. Deseja adicionar um agora?',
        'Adicionar pasta/arquivo',
        'Salvar workspace atual'
      );
      if (pickAdd === 'Adicionar pasta/arquivo') {
        await vscode.commands.executeCommand('workspaceControl.addFromPicker');
      } else if (pickAdd === 'Salvar workspace atual') {
        await vscode.commands.executeCommand('workspaceControl.addCurrent');
      }
      return;
    }

    const pick = await vscode.window.showQuickPick(
      items.map((entry) => ({
        label: entry.label,
        description: entry.path,
        detail: entry.kind === 'workspaceFile' ? 'Arquivo .code-workspace' : 'Pasta',
        entry
      })),
      {
        placeHolder: 'Escolha um workspace para abrir',
        matchOnDescription: true,
        matchOnDetail: true
      }
    );
    if (!pick) {
      return;
    }
    await openEntry(store, pick.entry);
  });

  register('workspaceControl.addCurrent', async () => {
    const wsFile = vscode.workspace.workspaceFile;
    const folders = vscode.workspace.workspaceFolders;

    let fsPath: string | undefined;
    let kind: SavedWorkspace['kind'] | undefined;

    if (wsFile && wsFile.scheme === 'file') {
      fsPath = wsFile.fsPath;
      kind = 'workspaceFile';
    } else if (folders && folders.length === 1) {
      fsPath = folders[0].uri.fsPath;
      kind = 'folder';
    } else if (folders && folders.length > 1) {
      const pick = await vscode.window.showQuickPick(
        folders.map((f) => ({ label: f.name, description: f.uri.fsPath, uri: f.uri })),
        { placeHolder: 'Workspace multi-root — escolha qual pasta salvar' }
      );
      if (!pick) {
        return;
      }
      fsPath = pick.uri.fsPath;
      kind = 'folder';
    }

    if (!fsPath || !kind) {
      vscode.window.showWarningMessage('Nenhum workspace aberto para salvar.');
      return;
    }

    const defaultLabel = defaultLabelFor(fsPath, kind);
    const label = await vscode.window.showInputBox({
      prompt: 'Nome para este workspace',
      value: defaultLabel
    });
    if (!label) {
      return;
    }

    try {
      await store.add({ id: newId(), label, path: fsPath, kind });
      vscode.window.showInformationMessage(`Workspace "${label}" salvo.`);
    } catch (err) {
      vscode.window.showWarningMessage(
        err instanceof Error ? err.message : 'Falha ao salvar workspace.'
      );
    }
  });

  register('workspaceControl.addFromPicker', async () => {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Adicionar',
      filters: { 'workspace': ['code-workspace'] },
      title: 'Selecione uma pasta ou arquivo .code-workspace'
    });
    if (!picked || picked.length === 0) {
      return;
    }
    const uri = picked[0];
    const kind = detectKind(uri.fsPath);
    if (!kind) {
      vscode.window.showWarningMessage(
        'Seleção inválida: escolha uma pasta ou arquivo .code-workspace existente.'
      );
      return;
    }

    const defaultLabel = defaultLabelFor(uri.fsPath, kind);
    const label = await vscode.window.showInputBox({
      prompt: 'Nome para este workspace',
      value: defaultLabel
    });
    if (!label) {
      return;
    }

    try {
      await store.add({ id: newId(), label, path: uri.fsPath, kind });
      vscode.window.showInformationMessage(`Workspace "${label}" adicionado.`);
    } catch (err) {
      vscode.window.showWarningMessage(
        err instanceof Error ? err.message : 'Falha ao adicionar workspace.'
      );
    }
  });

  register('workspaceControl.rename', async (arg: unknown) => {
    const entry = coerceEntry(arg);
    if (!entry) {
      return;
    }
    const label = await vscode.window.showInputBox({
      prompt: 'Novo nome',
      value: entry.label
    });
    if (!label || label === entry.label) {
      return;
    }
    await store.update(entry.id, { label });
  });

  register('workspaceControl.remove', async (arg: unknown) => {
    const entry = coerceEntry(arg);
    if (!entry) {
      return;
    }
    const confirm = await vscode.window.showWarningMessage(
      `Remover "${entry.label}" da lista? (A pasta não será apagada.)`,
      { modal: true },
      'Remover'
    );
    if (confirm !== 'Remover') {
      return;
    }
    await store.remove(entry.id);
  });

  register('workspaceControl.moveUp', async (arg: unknown) => {
    const entry = coerceEntry(arg);
    if (!entry) {
      return;
    }
    await store.move(entry.id, -1);
  });

  register('workspaceControl.moveDown', async (arg: unknown) => {
    const entry = coerceEntry(arg);
    if (!entry) {
      return;
    }
    await store.move(entry.id, +1);
  });

  register('workspaceControl.revealInExplorer', async (arg: unknown) => {
    const entry = coerceEntry(arg);
    if (!entry) {
      return;
    }
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(entry.path));
  });

  register('workspaceControl.refresh', () => {
    // Re-emits the store change so the tree refreshes.
    void store.setAll(store.getAll());
  });
}

function coerceEntry(arg: unknown): SavedWorkspace | undefined {
  if (!arg) {
    return undefined;
  }
  if (arg instanceof WorkspaceTreeItem) {
    return arg.entry;
  }
  if (typeof arg === 'object' && arg !== null && 'id' in arg && 'path' in arg) {
    return arg as SavedWorkspace;
  }
  return undefined;
}
