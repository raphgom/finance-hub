# Finance Hub 1.3.1 — Validação de contraste e tema

**Escopo:** correção visual da distribuição integral Finance Hub 1.3.0, sem mudanças no modelo de dados, migrações, rotas ou seed demonstrativo.

## Correções

- `color: var(--text)` definido diretamente em `.app-shell` para garantir que a cor ativa seja recalculada ao alternar o tema.
- Tokens dark para texto primário, secundário, superfícies, ícones, avisos, campos, menus e gráficos.
- Recharts: rótulos e eixos usam `var(--muted)`; linhas de grade usam `var(--chart-grid)`.
- Preferência por tema salva no `localStorage` do navegador. Nenhum dado financeiro é armazenado nessa preferência.
- Rótulos centrais dos gráficos circulares contextuais (investimentos, patrimônio, passivos, empresa).

## Evidências executadas no ambiente de desenvolvimento

- 35 testes locais Node.js aprovados, incluindo regressão de tema e fórmulas de contraste AA.
- Análise sintática TypeScript/TSX via compilador TypeScript para os componentes alterados, sem erros de parsing.
- Folha de estilo interpretada sem erros pelo parser CSS.
- Visualização em Chromium headless de um fixture HTML com as mesmas classes e folha de estilos dos componentes. Foram verificadas cores computadas para: títulos, descrições, KPIs, cabeçalhos, legendas, barras, navegação, aviso e cartões em ambos os temas. **Fixture não equivale à execução da aplicação Next.js real.**
- Contrastes representativos no modo escuro: título/fundo **15,38:1**; valor/cartão **13,54:1**; texto secundário/cartão **8,86:1**; texto de aviso/fundo **9,42:1**.
- Contrastes representativos no modo claro: título/fundo **13,68:1**; valor/cartão **14,52:1**; texto secundário/cartão **4,98:1**; texto de aviso/fundo **5,54:1**.
- Métrica de referência: WCAG 2.2 SC 1.4.3, contraste mínimo **4,5:1** para texto comum. Os índices são dos componentes testados, não uma declaração de conformidade integral WCAG.

## Validações que ainda dependem do host Windows 11

Build completo no Docker Desktop, execução e interação com a demo, regressão de todos os módulos via navegador real e testes integrados de banco. O ambiente de geração não dispõe de Docker Engine; este documento não substitui `demo-verify.ps1` e `acceptance.ps1`.

## Teste de aceite do usuário

1. Atualize a instalação existente preservando `secrets/` e volumes.
2. Entre em `http://localhost:3100`, abra **Dashboards & BI → Investimentos** e alterne entre claro/escuro.
3. Confira títulos, valores de KPIs, cabeçalhos, rótulos da legenda e tabela de posições.
4. Repita as verificações em **Executivo, Fluxo de caixa, Patrimônio, Empresa, Insights** e no formulário de cadastro.
5. Recarregue a página: a escolha de aparência deve persistir no navegador.
6. Execute `scripts/demo-verify.ps1` e `scripts/acceptance.ps1` para regressão funcional completa no Docker Desktop.
