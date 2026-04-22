# Workspace Control

Extensão para **Windsurf** (e VS Code) que permite salvar e alternar rapidamente entre múltiplos workspaces — ideal para quem mantém vários projetos abertos durante o dia.

## Funcionalidades

- **Lista persistente de workspaces** na Activity Bar ("Workspace Control").
- **Alternador rápido** com `Ctrl+Alt+W` (`Cmd+Alt+W` no macOS) — QuickPick com busca por nome e caminho.
- **Adicionar workspace atual** a qualquer momento (funciona com pasta simples ou `.code-workspace` multi-root).
- **Adicionar via diálogo**: escolha qualquer pasta ou arquivo `.code-workspace` do disco.
- **Abrir nesta janela** ou **em nova janela** (configurável).
- **Renomear, reordenar, remover** itens da lista.
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

## Configurações

| Chave | Valores | Descrição |
|-------|---------|-----------|
| `workspaceControl.defaultOpenBehavior` | `sameWindow`, `newWindow`, `ask` (padrão) | Como abrir um workspace quando clicado na lista. |
| `workspaceControl.storageScope` | `global` (padrão), `workspace` | Onde salvar a lista: entre todas as janelas ou por workspace aberto. |

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
