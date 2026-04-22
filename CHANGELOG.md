# Changelog

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
