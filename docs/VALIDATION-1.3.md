# Finance Hub 1.3.0 — Registro de validação

## Evidência recebida do Windows 11
Em 31/10/2026, os logs indicaram:
- Postgres inicializado, migração e teste de primeiro acesso concluídos.
- Serviço web e worker ativos.
- Quatro consultas da área de analytics falhando repetidamente com PostgreSQL SQLSTATE 42601, sintaxe inválida perto de `month`.

## Correção incorporada
1. Queries mensais alteradas para `AS "month"` nas agregações de transações, cartões, rendimentos e juros; compatibilidade preservada para o consumidor TypeScript (`row.month`).
2. Healthcheck integrado à execução real de consultas do analytics (workspace fictício de UUID zerado), impedindo falsos positivos de readiness com banco acessível e relatórios quebrados.
3. Consultas independentes de dashboard e grid na UI (`Promise.allSettled`) para permitir operar registros mesmo em caso de erro de BI; exibição explícita de erro com nova tentativa.
4. Ambiente demonstrativo em outro projeto Compose, com seed cifrada, transactional, verificações e três workspaces fictícios com 12 meses de dados.
5. Pipeline comercial ponderado exclui oportunidades encerradas.

## Verificações realizadas no ambiente de desenvolvimento
- Testes Node.js (`npm test`) — 26 casos aprovados.
- Sintaxe Node.js do `seed-demo.mjs` e dos scripts backend principais — aprovada.
- Leitura YAML de `compose.yaml` e `compose.demo.yaml` — aprovada.
- Revisão dos trechos SQL observados nos logs e conferência com a documentação oficial PostgreSQL sobre aliases.
- ZIP empacotado e inspeção de caminhos.

## Verificações NÃO realizadas neste ambiente
- `docker compose up --build -d` completo.
- Execução de migrações com PostgreSQL real.
- Primeira autenticação e chamadas ao seed de demonstração com banco real.
- Smoke E2E no browser e no Windows 11.
- Revisão independente de segurança e testes de backup/restauração.

Motivo: Docker Engine indisponível neste ambiente e registro npm inacessível. Os testes unitários e contratuais **não substituem** testes integrados.

## Aceite no Windows 11
Execute `scripts/start.ps1`, `scripts/acceptance.ps1`, `scripts/demo.ps1`, `scripts/demo-verify.ps1`. Não cadastre dados reais antes que essas verificações e um ensaio de recuperação passem.
