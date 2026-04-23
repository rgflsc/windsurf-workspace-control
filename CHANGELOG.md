# Changelog

## 0.6.8 — Remote URL correto em git worktrees

- **Corrigido**: em git worktrees, a URL do remote não aparecia no tooltip. `<gitDir>` de um worktree aponta para `<main>/.git/worktrees/<nome>`, que não contém `config`; a config com remotes fica no `.git` principal. Agora resolvemos o `commondir` antes de ler o config.

## 0.6.7 — Cleanup dos debounce timers do watcher de HEAD

- **Corrigido**: os timers de debounce do watcher de `<gitdir>/HEAD` eram guardados no closure do watcher e não eram cancelados em `dispose()`/`invalidate()`. Se um timer disparasse depois do `dispose()`, ele chamava `fire()` num EventEmitter já disposto; depois de um `invalidate()` seguido de refresh, um timer antigo podia apagar a entrada recém-populada do cache. Agora os timers ficam num `Map` no nível da classe e são cancelados corretamente.

## 0.6.6 — Ajustes no tooltip + remote URL sem dependência de `git` CLI

- **Tooltip**: path do workspace agora é renderizado em minúsculas.
- **Tooltip**: removida a linha `Git: <branch>` (a branch já aparece na description do item da árvore).
- **Remote URL**: passou a ser lido direto de `<gitdir>/config` (parser INI interno) em vez de `git remote get-url`. Resultado: a URL do repositório aparece mesmo quando o extension host não tem o `git` CLI na PATH.

## 0.6.5 — Leitura direta de `.git/HEAD` e suporte a worktrees

- **Corrigido**: em alguns setups a description ainda mostrava o literal `HEAD` — acontecia quando o processo da extensão não encontrava o binário `git` na PATH (comum no extension host do Windsurf no Windows). A leitura da branch agora é feita direto do arquivo `<gitdir>/HEAD`, sem shell-out, então não depende do `git` CLI.
- **Suporte a worktrees/submodules**: quando `.git` é um arquivo `gitdir: ...`, seguimos a indireção pra localizar o HEAD real.
- `git` continua sendo usado para `dirty` e leitura do remote — onde uma falha cai silenciosamente para "sem info" em vez de quebrar.

## 0.6.4 — Detecção de branch mais robusta, description só com marcadores

- **Corrigido**: em alguns cenários a description mostrava o SHA do commit em vez do nome da branch. Agora usamos `git symbolic-ref --short HEAD` (fonte autoritativa pro nome da branch) e só caímos pro SHA quando o HEAD está realmente detached — com prefixo `@` (ex.: `@a1b2c3d`) pra deixar claro que não é branch.
- **Watcher de `.git/HEAD` com debounce de 500ms**: rebase/pull/checkout multi-step escreviam HEAD várias vezes em sequência (incluindo estados transitórios detached), e o cache as vezes congelava em um SHA intermediário. Agora só refrescamos depois que o filesystem assenta.
- **UI**: removidos os `#tags` da description do item. A cor da tag continua visível no ícone, e o agrupamento por tag segue idêntico.

## 0.6.3 — Branch refresh, detached HEAD e description mais limpa

- **Corrigido**: a descrição mostrava `HEAD` quando o repo estava em detached HEAD (ex.: durante rebase/`git pull --rebase`, checkout direto de um SHA, bisect). Agora exibimos o SHA curto (`abc1234`) nesse caso.
- **Novo**: a extensão agora observa `<repo>/.git/HEAD` via `fs.watch` e invalida o cache de git status ao detectar troca de branch — antes o `Ctrl+Shift+P → Reload Window` (ou esperar os 30s do TTL) era necessário pra ver o novo branch.
- **UI**: removido o path do projeto da description (linha ao lado do nome); continua visível no tooltip. Description ficou mais enxuta: só marcadores (atual/pinado/arquivado/git) e tags.

## 0.6.2 — URL do remote git no tooltip

- **Novo**: o tooltip de cada item agora mostra a URL do remote git (`origin`, ou o primeiro remote disponível) quando o workspace é um repositório. URLs SSH (`git@host:org/repo.git`) e `ssh://` são normalizadas para `https://` clicáveis e o sufixo `.git` é removido.

## 0.6.1 — Fix: terminal externo no Windows

- **Corrigido** `Abrir terminal externo aqui` no Windows: o `spawn('cmd.exe', [], { cwd })` da v0.6.0 não criava uma janela de console visível (o `cmd.exe` sem stdio conectado saía silenciosamente). Agora usamos `start "" /D "<cwd>" cmd.exe` via shell para abrir uma nova janela de console no diretório correto.

## 0.6.0 — Arquivar, notas, descoberta, terminal e cores por workspace

- **Arquivar/desarquivar** workspaces sem deletar. Itens arquivados ficam ocultos por padrão e reaparecem com o toggle `Mostrar arquivados` no topo da view.
- **Notas por workspace**: comando `Editar notas...` no menu de contexto; o texto aparece no final do tooltip.
- **Auto-descobrir repos**: `Workspace Control: Auto-descobrir workspaces em pasta...` escaneia a pasta-base escolhida e sugere adicionar subpastas com `.git` ou arquivos `.code-workspace` em lote (com tags opcionais aplicadas a todos).
- **Abrir todos de uma tag em novas janelas**: ação inline no grupo de tag; confirma antes de abrir, com pequeno delay entre janelas.
- **Favoritos com atalho**: `Ctrl+Alt+1..9` abrem o N-ésimo workspace pinado (ordenados alfabeticamente).
- **Reabrir último**: `Workspace Control: Reabrir último workspace` / `Ctrl+Alt+L` reabre o workspace com `lastOpenedAt` mais recente.
- **Terminal externo no path**: `Abrir terminal externo aqui` no menu de contexto. macOS usa `open -a Terminal`, Windows usa `cmd /K`, Linux tenta `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `alacritty`, `kitty`, `xterm`.
- **Cor por workspace**: `Definir cor do workspace...` aplica `workbench.colorCustomizations` no nível de workspace ao abrir (titleBar, activityBar, statusBar tintados com a cor escolhida). `Remover cor do workspace` limpa. Paleta de 9 cores pré-definidas; contraste do foreground calculado automaticamente.

## 0.5.4

- Status bar agora exibe **apenas o nome do workspace** colorido com a cor da primeira tag (quando houver). Sem ícone de pasta, sem git, sem sufixo de tags. Oculto quando o workspace atual não está na lista salva ou `showStatusBar` está desligado.

## 0.5.3

- Tooltip dos itens da árvore enxuto: removidos o nome/label, `Tipo:`, `Tags:` e `Nome do item:`. Mantidos apenas path, git, marcadores de pinado/atual e último acesso.

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
