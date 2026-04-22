import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SavedWorkspace, normalizeTags } from './types';
import { WorkspaceStore } from './workspaceStore';
import {
  TagGroupTreeItem,
  WorkspaceTreeItem,
  WorkspaceTreeNode,
  WorkspaceTreeProvider
} from './workspaceProvider';
import { TagColorStore, TAG_COLOR_OPTIONS } from './tagColorStore';
import { FilterState, UNTAGGED_FILTER_KEY } from './filterState';
import { SearchState } from './searchState';
import { GitStatusCache } from './gitStatus';

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

function collectKnownTags(store: WorkspaceStore): string[] {
  const set = new Set<string>();
  for (const entry of store.getAll()) {
    for (const tag of normalizeTags(entry.tags)) {
      set.add(tag);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

async function pickTags(
  store: WorkspaceStore,
  currentTags: string[],
  placeHolder: string
): Promise<string[] | undefined> {
  const known = collectKnownTags(store);
  const allCandidates = Array.from(
    new Set<string>([...known, ...normalizeTags(currentTags)])
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  type Item = vscode.QuickPickItem & { tagValue?: string; isCreate?: boolean };
  const pickItems: Item[] = allCandidates.map((tag) => ({
    label: tag,
    picked: currentTags.some((t) => t.toLowerCase() === tag.toLowerCase()),
    tagValue: tag
  }));
  pickItems.push({
    label: '$(add) Criar nova tag...',
    description: 'Digite um novo nome',
    isCreate: true
  });

  const picked = await vscode.window.showQuickPick(pickItems, {
    placeHolder,
    canPickMany: true,
    matchOnDescription: false
  });
  if (!picked) {
    return undefined;
  }

  const selectedTags = picked
    .filter((p): p is Item & { tagValue: string } => Boolean(p.tagValue))
    .map((p) => p.tagValue);

  if (picked.some((p) => p.isCreate)) {
    const raw = await vscode.window.showInputBox({
      prompt: 'Nome(s) de nova(s) tag(s), separadas por vírgula',
      placeHolder: 'ex: cliente-acme, backend'
    });
    if (raw) {
      selectedTags.push(...raw.split(',').map((t) => t.trim()).filter(Boolean));
    }
  }

  return normalizeTags(selectedTags);
}

export function registerCommands(
  context: vscode.ExtensionContext,
  store: WorkspaceStore,
  colorStore: TagColorStore,
  filter: FilterState,
  provider: WorkspaceTreeProvider,
  _view: vscode.TreeView<WorkspaceTreeNode>,
  search: SearchState,
  gitStatus: GitStatusCache
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
      items.map((entry) => {
        const tags = normalizeTags(entry.tags);
        const detailParts = [entry.kind === 'workspaceFile' ? 'Arquivo .code-workspace' : 'Pasta'];
        if (tags.length > 0) {
          detailParts.push(tags.map((t) => `#${t}`).join(' '));
        }
        return {
          label: entry.label,
          description: entry.path,
          detail: detailParts.join('  •  '),
          entry
        };
      }),
      {
        placeHolder: 'Escolha um workspace para abrir (digite @tag para filtrar por tag)',
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

    await addWorkspaceWithPrompts(store, fsPath, kind);
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

    await addWorkspaceWithPrompts(store, uri.fsPath, kind);
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

  register('workspaceControl.editTags', async (arg: unknown) => {
    const entry = coerceEntry(arg);
    if (!entry) {
      return;
    }
    const current = normalizeTags(entry.tags);
    const next = await pickTags(
      store,
      current,
      `Selecione tags para "${entry.label}"`
    );
    if (!next) {
      return;
    }
    await store.update(entry.id, { tags: next });
    vscode.window.showInformationMessage(
      next.length > 0
        ? `Tags atualizadas: ${next.map((t) => `#${t}`).join(' ')}`
        : `Tags removidas de "${entry.label}".`
    );
  });

  register('workspaceControl.renameTag', async (arg: unknown) => {
    const tag = coerceTag(arg);
    if (!tag) {
      return;
    }
    const next = await vscode.window.showInputBox({
      prompt: `Renomear tag "${tag}" em todos os workspaces`,
      value: tag
    });
    if (!next) {
      return;
    }
    const normalized = normalizeTags([next])[0];
    if (!normalized || normalized === tag) {
      return;
    }
    const all = store.getAll();
    let changed = 0;
    for (const entry of all) {
      const entryTags = normalizeTags(entry.tags);
      if (!entryTags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        continue;
      }
      const nextTags = normalizeTags(
        entryTags.map((t) => (t.toLowerCase() === tag.toLowerCase() ? normalized : t))
      );
      await store.update(entry.id, { tags: nextTags });
      changed += 1;
    }
    vscode.window.showInformationMessage(
      `Tag "${tag}" renomeada para "${normalized}" em ${changed} workspace(s).`
    );
  });

  register('workspaceControl.deleteTag', async (arg: unknown) => {
    const tag = coerceTag(arg);
    if (!tag) {
      return;
    }
    const confirm = await vscode.window.showWarningMessage(
      `Remover a tag "${tag}" de todos os workspaces? (Workspaces não serão removidos.)`,
      { modal: true },
      'Remover tag'
    );
    if (confirm !== 'Remover tag') {
      return;
    }
    const all = store.getAll();
    let changed = 0;
    for (const entry of all) {
      const entryTags = normalizeTags(entry.tags);
      if (!entryTags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        continue;
      }
      const nextTags = entryTags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
      await store.update(entry.id, { tags: nextTags });
      changed += 1;
    }
    vscode.window.showInformationMessage(
      `Tag "${tag}" removida de ${changed} workspace(s).`
    );
  });

  register('workspaceControl.toggleGrouping', async () => {
    const cfg = vscode.workspace.getConfiguration('workspaceControl');
    const current = cfg.get<boolean>('groupByTags', true);
    await cfg.update('groupByTags', !current, vscode.ConfigurationTarget.Global);
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
    void store.setAll(store.getAll());
  });

  register('workspaceControl.filterByTag', async () => {
    const knownTags = collectKnownTags(store);
    if (knownTags.length === 0) {
      const untagged = store.getAll().some((e) => normalizeTags(e.tags).length === 0);
      if (!untagged) {
        vscode.window.showInformationMessage(
          'Nenhuma tag existe ainda. Use "Editar tags..." em um workspace primeiro.'
        );
        return;
      }
    }

    type Item = vscode.QuickPickItem & { tagKey: string };
    const currentActive = new Set(filter.getActive());
    const items: Item[] = knownTags.map((tag) => ({
      label: `#${tag}`,
      tagKey: tag.toLowerCase(),
      picked: currentActive.has(tag.toLowerCase())
    }));
    items.push({
      label: 'Untagged',
      description: 'Workspaces sem tag',
      tagKey: UNTAGGED_FILTER_KEY,
      picked: currentActive.has(UNTAGGED_FILTER_KEY)
    });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Filtrar por tag(s). Vazio = mostrar tudo.',
      canPickMany: true
    });
    if (!picked) {
      return;
    }
    if (picked.length === 0) {
      filter.clear();
      return;
    }
    filter.set(picked.map((p) => p.tagKey));
  });

  register('workspaceControl.clearFilter', () => {
    filter.clear();
  });

  register('workspaceControl.setTagColor', async (arg: unknown) => {
    const tag = coerceTag(arg);
    if (!tag) {
      return;
    }
    const pick = await vscode.window.showQuickPick(
      TAG_COLOR_OPTIONS.map((opt) => ({
        label: opt.label,
        description: opt.themeColor ?? '—',
        id: opt.id
      })),
      { placeHolder: `Escolha uma cor para a tag "${tag}"` }
    );
    if (!pick) {
      return;
    }
    await colorStore.setColor(tag, pick.id);
  });

  register('workspaceControl.clearTagColor', async (arg: unknown) => {
    const tag = coerceTag(arg);
    if (!tag) {
      return;
    }
    await colorStore.clear(tag);
  });

  register('workspaceControl.search', async () => {
    const value = await vscode.window.showInputBox({
      prompt: 'Buscar workspaces por nome ou caminho',
      value: search.query,
      placeHolder: 'Digite um trecho do nome ou caminho'
    });
    if (value === undefined) {
      return;
    }
    search.set(value);
  });

  register('workspaceControl.clearSearch', () => {
    search.clear();
  });

  register('workspaceControl.refreshGitStatus', () => {
    gitStatus.invalidate();
  });

  register('workspaceControl.expandAllGroups', async () => {
    await provider.setGroupsCollapsed(false);
  });

  register('workspaceControl.collapseAllGroups', async () => {
    await provider.setGroupsCollapsed(true);
  });

  register('workspaceControl.pin', async (arg: unknown) => {
    const entry = coerceEntry(arg);
    if (!entry) {
      return;
    }
    await store.update(entry.id, { pinned: true });
  });

  register('workspaceControl.unpin', async (arg: unknown) => {
    const entry = coerceEntry(arg);
    if (!entry) {
      return;
    }
    await store.update(entry.id, { pinned: false });
  });

  register('workspaceControl.openRecent', async () => {
    const items = store
      .getAll()
      .filter((e) => !!e.lastOpenedAt)
      .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''));
    if (items.length === 0) {
      vscode.window.showInformationMessage(
        'Nenhum workspace foi aberto ainda por esta extensão.'
      );
      return;
    }
    const pick = await vscode.window.showQuickPick(
      items.map((entry) => {
        const tags = normalizeTags(entry.tags);
        const detailParts = [
          entry.kind === 'workspaceFile' ? 'Arquivo .code-workspace' : 'Pasta'
        ];
        if (tags.length > 0) {
          detailParts.push(tags.map((t) => `#${t}`).join(' '));
        }
        if (entry.lastOpenedAt) {
          detailParts.push(`aberto ${new Date(entry.lastOpenedAt).toLocaleString()}`);
        }
        return {
          label: `${entry.pinned ? '★ ' : ''}${entry.label}`,
          description: entry.path,
          detail: detailParts.join('  •  '),
          entry
        };
      }),
      {
        placeHolder: 'Workspaces recentes (mais recente primeiro)',
        matchOnDescription: true,
        matchOnDetail: true
      }
    );
    if (!pick) {
      return;
    }
    await openEntry(store, pick.entry);
  });

  register('workspaceControl.exportJson', async () => {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        path.join(
          process.env.HOME ?? process.env.USERPROFILE ?? '.',
          'windsurf-workspace-control-export.json'
        )
      ),
      filters: { JSON: ['json'] },
      title: 'Exportar workspaces salvos'
    });
    if (!uri) {
      return;
    }
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: store.getAll(),
      tagColors: colorStore.getAllRaw()
    };
    try {
      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(JSON.stringify(payload, null, 2), 'utf8')
      );
      vscode.window.showInformationMessage(
        `Exportados ${payload.workspaces.length} workspace(s) para ${uri.fsPath}.`
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        `Falha ao exportar: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  register('workspaceControl.importJson', async () => {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { JSON: ['json'] },
      title: 'Importar workspaces salvos'
    });
    if (!picked || picked.length === 0) {
      return;
    }
    let raw: Buffer;
    try {
      raw = Buffer.from(await vscode.workspace.fs.readFile(picked[0]));
    } catch (err) {
      vscode.window.showErrorMessage(
        `Falha ao ler arquivo: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }
    let payload: {
      version?: number;
      workspaces?: SavedWorkspace[];
      tagColors?: Record<string, string>;
    };
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch (err) {
      vscode.window.showErrorMessage(
        `JSON inválido: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }
    const incoming = Array.isArray(payload.workspaces) ? payload.workspaces : [];
    const hasTagColors = !!(payload.tagColors && typeof payload.tagColors === 'object' && Object.keys(payload.tagColors).length > 0);
    const sanitized: SavedWorkspace[] = incoming
      .filter((e) => e && typeof e.path === 'string' && typeof e.label === 'string' && (e.kind === 'folder' || e.kind === 'workspaceFile'))
      .map((e) => ({
        id: typeof e.id === 'string' ? e.id : newId(),
        label: e.label,
        path: e.path,
        kind: e.kind,
        lastOpenedAt: typeof e.lastOpenedAt === 'string' ? e.lastOpenedAt : undefined,
        tags: normalizeTags(e.tags),
        pinned: !!e.pinned
      }));
    if (sanitized.length === 0 && !hasTagColors) {
      vscode.window.showWarningMessage('Arquivo não contém workspaces nem cores.');
      return;
    }
    let mode: { value: 'merge' | 'replace' } | undefined;
    if (sanitized.length > 0) {
      const pick = await vscode.window.showQuickPick(
        [
          { label: 'Mesclar', description: 'Adiciona itens novos (ignora paths já existentes)', value: 'merge' as const },
          { label: 'Substituir', description: 'Apaga a lista atual e substitui pelo arquivo', value: 'replace' as const }
        ],
        { placeHolder: 'Como importar?' }
      );
      if (!pick) {
        return;
      }
      mode = { value: pick.value };
    }
    let addedCount = 0;
    let skippedCount = 0;
    if (mode?.value === 'replace') {
      await store.setAll(sanitized);
      addedCount = sanitized.length;
    } else if (mode?.value === 'merge') {
      const existing = store.getAll();
      const seenPaths = new Set(existing.map((e) => e.path));
      const merged = [...existing];
      for (const e of sanitized) {
        if (seenPaths.has(e.path)) {
          skippedCount++;
          continue;
        }
        merged.push({ ...e, id: newId() });
        seenPaths.add(e.path);
        addedCount++;
      }
      await store.setAll(merged);
    }
    if (hasTagColors) {
      await colorStore.importMap(payload.tagColors as Record<string, string>, mode?.value === 'replace');
    }
    if (!mode) {
      vscode.window.showInformationMessage(
        'Apenas as cores de tags foram importadas (o arquivo não continha workspaces).'
      );
    } else if (mode.value === 'replace') {
      vscode.window.showInformationMessage(
        `Lista substituída: ${addedCount} workspace(s).`
      );
    } else {
      const skipSuffix = skippedCount > 0 ? ` (${skippedCount} ignorado(s) por já existirem)` : '';
      vscode.window.showInformationMessage(
        `Importados ${addedCount} workspace(s)${skipSuffix}.`
      );
    }
  });
}

async function addWorkspaceWithPrompts(
  store: WorkspaceStore,
  fsPath: string,
  kind: SavedWorkspace['kind']
): Promise<void> {
  const defaultLabel = defaultLabelFor(fsPath, kind);
  const label = await vscode.window.showInputBox({
    prompt: 'Nome para este workspace',
    value: defaultLabel
  });
  if (!label) {
    return;
  }

  const tags = await pickTags(store, [], `Tags para "${label}" (opcional)`);

  try {
    await store.add({
      id: newId(),
      label,
      path: fsPath,
      kind,
      tags: tags && tags.length > 0 ? tags : undefined
    });
    vscode.window.showInformationMessage(`Workspace "${label}" salvo.`);
  } catch (err) {
    vscode.window.showWarningMessage(
      err instanceof Error ? err.message : 'Falha ao salvar workspace.'
    );
  }
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

function coerceTag(arg: unknown): string | undefined {
  if (!arg) {
    return undefined;
  }
  if (arg instanceof TagGroupTreeItem) {
    return arg.tag === 'Untagged' ? undefined : arg.tag;
  }
  if (typeof arg === 'string') {
    const trimmed = arg.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}
