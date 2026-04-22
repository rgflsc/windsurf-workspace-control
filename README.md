# Workspace Control

Extensão para **Windsurf** (e VS Code) que permite salvar e alternar rapidamente entre múltiplos workspaces — ideal para quem mantém vários projetos abertos durante o dia.

## Funcionalidades

- **Lista persistente de workspaces** na Activity Bar ("Workspace Control").
- **Tags de agrupamento**: cada workspace pode ter múltiplas tags livres (ex.: `cliente-acme`, `backend`, `pessoal`). A view agrupa automaticamente por tag e mostra "Untagged" para os sem tag.
- **Alternador rápido** com `Ctrl+Alt+W` (`Cmd+Alt+W` no macOS) — QuickPick com busca por nome, caminho e tags.
- **Adicionar workspace atual** a qualquer momento (funciona com pasta simples ou `.code-workspace` multi-root).
- **Adicionar via diálogo**: escolha qualquer pasta ou arquivo `.code-workspace` do disco.
- **Abrir nesta janela** ou **em nova janela** (configurável).
- **Renomear, reordenar, remover** itens da lista.
- **Renomear tag**, **remover tag de todos os workspaces** e **definir cor da tag** pelo menu de contexto do grupo.
- **Filtro por tag** direto na TreeView (multi-select) com indicador "Filtrando: ..." no topo.
- **Status bar** mostra ícone + label + tags do workspace atual quando ele estiver salvo; clique abre o alternador.
- **Favoritos (pinados)**: workspaces fixados aparecem primeiro em cada grupo com prefixo ★.
- **Recentes**: atalho `Ctrl+Alt+R` abre QuickPick de workspaces ordenados por último acesso.
- **Exportar / Importar JSON** da lista completa (workspaces + cores de tags).
- **Revelar no explorador do SO**.
- **Escopo de armazenamento** global (padrão) ou por workspace.

## Instalação

### A partir do `.vsix` publicado na release

1. Baixe o arquivo `windsurf-workspace-control-<versão>.vsix` da página de [Releases](https://github.com/rgflsc/windsurf-workspace-control/releases).
2. No Windsurf, abra a Command Palette (`Ctrl+Shift+P`) e execute **"Extensions: Install from VSIX..."**.
3. Selecione o `.vsix` baixado.
4. Recarregue a janela.

### Build local

```bash
git clone https://github.com/rgflsc/windsurf-workspace-control.git
cd windsurf-workspace-control
npm install
npm run package   # gera um .vsix na raiz
```

Depois instale via **"Extensions: Install from VSIX..."** apontando para o arquivo gerado.

## Uso

| Ação | Como |
|------|------|
| Abrir alternador | `Ctrl+Alt+W` (`Cmd+Alt+W` no macOS) ou comando **Workspace Control: Alternar workspace...** |
| Salvar workspace atual | Botão `+` no topo da view, ou comando **Workspace Control: Salvar workspace atual** |
| Adicionar pasta/arquivo qualquer | Botão de pasta no topo da view, ou **Adicionar workspace a partir de pasta/arquivo...** |
| Renomear / remover / reordenar | Menu de contexto em cada item da lista |
| Editar tags de um workspace | Menu de contexto do item → **Editar tags...** (multi-select das tags existentes + criar novas) |
| Alternar entre lista plana e agrupada | Botão **"list-tree"** no topo da view, ou **Workspace Control: Alternar agrupamento por tags** |
| Renomear / remover tag globalmente | Menu de contexto do grupo de tag |
| Definir cor da tag | Menu de contexto do grupo → **Definir cor da tag...** (10 cores de tema) |
| Filtrar TreeView por tag | Botão **filter** no topo da view, ou **Workspace Control: Filtrar por tag...** |
| Limpar filtro | Clique no indicador "Filtrando: ..." no topo, botão **clear-all**, ou **Workspace Control: Limpar filtro** |
| Fixar / desafixar workspace | Menu de contexto do item → **Fixar no topo** / **Desafixar** |
| Abrir recente | `Ctrl+Alt+R` (`Cmd+Alt+R` no Mac), ou **Workspace Control: Abrir recente...** |
| Exportar / importar JSON | **Workspace Control: Exportar para JSON...** / **Importar de JSON...** |

## Configurações

| Chave | Valores | Descrição |
|-------|---------|-----------|
| `workspaceControl.defaultOpenBehavior` | `sameWindow`, `newWindow`, `ask` (padrão) | Como abrir um workspace quando clicado na lista. |
| `workspaceControl.storageScope` | `global` (padrão), `workspace` | Onde salvar a lista: entre todas as janelas ou por workspace aberto. |
| `workspaceControl.groupByTags` | `true` (padrão), `false` | Agrupa os itens por tag na view. Workspaces sem tag vão para "Untagged". |
| `workspaceControl.showStatusBar` | `true` (padrão), `false` | Exibe um item na Status Bar com o workspace atual quando ele estiver salvo. |

## Desenvolvimento

```bash
npm install
npm run watch   # compilação contínua
```

No Windsurf/VS Code, pressione `F5` com este projeto aberto para iniciar uma janela de desenvolvimento da extensão.

## Compatibilidade

Funciona com Windsurf e qualquer IDE baseado em VS Code (engine `^1.80.0`). Usa apenas APIs estáveis do VS Code Extension API.

## Licença

MIT — © Rodrigo Garcia
