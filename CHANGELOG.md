# Changelog

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
