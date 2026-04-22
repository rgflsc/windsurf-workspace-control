# Changelog

## 0.5.2

- Remove os comandos **Mover para cima** / **Mover para baixo** (e o método `move` do store). A árvore é sempre ordenada automaticamente (pinados primeiro, depois alfabética), então esses comandos eram dead code desde a v0.3.3.

## 0.5.1

- **Status bar enxuto**: agora mostra apenas o branch + indicador de modificado (●) do workspace atual. Se o workspace não for um repositório git (ou não estiver salvo), o item fica oculto. Removidos label, ícone de pasta e tags coloridas do status bar.

## 0.5.0 — Busca, drag & drop, git status

- **Busca incremental** na TreeView: novo botão `$(search)` e comando `workspaceControl.search` abrem um InputBox; a busca filtra por substring no `label`/`path` (case-insensitive) e combina com o filtro por tag. Indicador "Buscando: ..." no topo, clicável para limpar.
- **Drag & drop** de workspaces entre grupos de tag: arraste um item pra dentro de outro grupo e a tag principal é substituída pela do destino. Soltar em **Untagged** limpa as tags. Reordenação interna continua automática (alfabética + pinados primeiro).
- **Git status inline**: branch atual e `●` quando há alterações, exibidos na description de cada workspace do tipo `folder` (e de `.code-workspace` cuja pasta pai é um repo). Leitura assíncrona com cache TTL de 30s. Comando `Workspace Control: Recarregar status do Git` força refresh manual.

## 0.4.2

- Fix: botão de expandir/recolher agora realmente abre e fecha os grupos. O VS Code cacheia o estado de expand/collapse pelo `id` do TreeItem, então só trocar `collapsibleState` ao refrescar não surte efeito. Passamos a incluir o estado (`c`/`e`) no `id`, forçando o tree a instanciar um novo item com o `collapsibleState` correto.

## 0.4.1

- Botão **Expandir / Recolher** unificado no topo da view: mostra `collapse-all` quando os grupos estão expandidos e `expand-all` quando estão recolhidos. O comando altera o estado e a árvore é remontada com o `collapsibleState` correto.
- Removido o botão Collapse All nativo do TreeView.
- Comandos: `workspaceControl.expandAllGroups` e `workspaceControl.collapseAllGroups` (o antigo `workspaceControl.expandAll` foi removido).

## 0.4.0 — Favoritos, recentes e export/import

- **Favoritos (pinados)**: novos comandos **Fixar no topo** / **Desafixar** no menu de contexto. Itens pinados aparecem primeiro em cada grupo (ou na lista plana) e ganham prefixo `★` no label + "pinado" na description.
- **Recentes**: novo comando **Workspace Control: Abrir recente...** com atalho `Ctrl+Alt+R` (`Cmd+Alt+R` no Mac). Abre um QuickPick ordenado pelo `lastOpenedAt` mais recente.
- **Export/Import JSON**: novos comandos **Exportar para JSON...** e **Importar de JSON...** no Command Palette. Exporta lista de workspaces + mapa de cores de tags. Import pergunta "Mesclar" (adiciona só paths novos) ou "Substituir" (apaga tudo e substitui). Estrutura:
  ```json
  { "version": 1, "workspaces": [...], "tagColors": { "tag": "colorId" } }
  ```

## 0.3.5

- Fix: itens inline (abrir nesta/nova janela) e menus de contexto voltam a aparecer também no workspace marcado como "atual". As cláusulas `viewItem == workspaceEntry` passaram para regex `viewItem =~ /^workspaceEntry/`, cobrindo tanto `workspaceEntry` quanto `workspaceEntry.current`.

## 0.3.4

- Marcação "● atual" no workspace aberto na sessão atual: prefixo **●** no label e texto "atual  •  ..." no início da descrição. A cor da tag (se houver) é preservada.
- `contextValue` separado (`workspaceEntry.current`) para permitir menus específicos no futuro.
- Lógica de match do workspace atual extraída para `src/currentWorkspace.ts` e reutilizada pela StatusBar.
- Árvore reage a `onDidChangeWorkspaceFolders` para atualizar a marca automaticamente.

## 0.3.3

- Ordenação consistente na TreeView:
  - Modo agrupado: grupos em ordem alfabética de tag; dentro de cada grupo, workspaces em ordem alfabética de nome.
  - Modo flat: workspaces em ordem alfabética de nome.
- Comandos **Mover para cima/baixo** ficam sem efeito visível enquanto a ordenação automática estiver ativa (ainda alteram a ordem interna de armazenamento).

## 0.3.2

- Removido o toast informativo ao alternar o agrupamento por tags — a mudança já é visível na própria lista.

## 0.3.1

- Novo botão **Expandir todos os grupos** (`$(expand-all)`) no topo da view, complementando o Collapse All nativo. Disponível apenas quando o agrupamento por tag estiver ativo.

## 0.3.0 — Status bar, filtro e cores

- **Status bar**: item à esquerda mostra ícone + label + tags do workspace atual (quando ele estiver salvo). Clique abre o QuickPick de alternar. Config `workspaceControl.showStatusBar` (default `true`).
- **Filtro por tag na TreeView**: novo botão **Filtrar por tag...** no topo da view (ou comando do Command Palette). Quando ativo, aparece um item "Filtrando: #a #b" no topo da lista; clicar nele ou usar **Limpar filtro** limpa.
- **Cores por tag**: novo comando **Definir cor da tag...** no menu de contexto do grupo. Escolha entre 10 cores de tema (charts.*, editorWarning.foreground, etc.). O ícone do grupo e o ícone dos itens (pela 1ª tag) passam a refletir a cor. Cores são persistidas via `globalState`.

## 0.2.1

- TreeView agora recarrega automaticamente ao alternar `workspaceControl.groupByTags` (ou `workspaceControl.storageScope`), seja via comando/botão ou editando as configurações manualmente.

## 0.2.0 — Tags & grupos

- Novo campo `tags` por workspace (normalizado, case-insensitive, sem duplicatas).
- Visualização **agrupada por tags** na Activity Bar (toggle via configuração `workspaceControl.groupByTags` ou botão no topo da view).
- Grupo automático **"Untagged"** para workspaces sem tag.
- Novo comando **Editar tags...** com QuickPick multi-select das tags já usadas + opção "Criar nova tag...".
- Novos comandos **Renomear tag...** e **Remover tag de todos os workspaces...** (menu de contexto no grupo).
- QuickPick do alternador rápido agora exibe as tags no `detail`.
- Ao salvar/adicionar workspace, o fluxo oferece escolher as tags iniciais (opcional).

## 0.1.0 — Initial release

- Lista persistente de workspaces na Activity Bar.
- Alternador rápido (`Ctrl+Alt+W` / `Cmd+Alt+W`).
- Adicionar workspace atual ou via diálogo de arquivo/pasta.
- Suporte a pastas simples e arquivos `.code-workspace`.
- Abrir na mesma janela ou em nova janela (configurável).
- Renomear, reordenar, remover e revelar no explorador do SO.
- Escopo de armazenamento global ou por workspace.
