# Galeria de imagens

`demo-investimentos-light.png`, `demo-kpis-investimentos.png` e `demo-alocacao-portfolio.png` vêm de uma captura real fornecida pelo proprietário, com **dados fictícios** da demo; foram recortadas as barras do navegador e do sistema operacional. Esses três arquivos representam a mesma tela, em escalas diferentes, não três dashboards distintos. A captura mostra uma versão anterior ao ajuste do rótulo central do gráfico; o código-fonte atual já inclui esse ajuste.

`preview-investimentos-dark.png` é uma **prévia de renderização** utilizada na validação visual do tema escuro, não uma captura end-to-end do Docker.

Para obter prints reais e atualizados de **todos os 12 dashboards, nos temas claro/escuro**, execute `node scripts/capture-demo.mjs` com a demo local carregada, ou acione manualmente a workflow `demo-gallery.yml` no GitHub Actions. Em modo manual, `publish_images=true` pode incluir as imagens geradas diretamente na branch selecionada.

Não publique capturas da instalação principal com dados financeiros reais.
