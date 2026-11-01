# Registro de verificação — versão 1.2.0

Data de compilação do pacote: 2026-10-31.

## Executado neste ambiente

- `node --experimental-strip-types --test tests/*.test.mjs`: 16 testes unitários e regressões aprovados.
- Verificação sintática da implementação TypeScript/TSX via TypeScript Compiler API sem erros de parsing.
- `node --check` dos scripts `backup.mjs` e `worker.mjs` sem erros sintáticos.
- Leitura estrutural do `compose.yaml` como YAML válida.
- Comparação de escolhas técnicas com documentação oficial de Docker Desktop, Next.js e recomendações OWASP.

## Não executado neste ambiente

- `docker compose build` / `docker compose up` — Docker Engine ausente.
- Build `next build` e `tsc --noEmit` com dependências reais — rede npm indisponível neste ambiente.
- Integração Next.js ↔ PostgreSQL, testes reais de importação, autenticação, execução do worker e restore de backup.
- Testes end-to-end com Playwright em navegador, segurança dinâmica, testes de carga e validação Windows 11.

## Riscos conhecidos / limites de escopo

- Não há lockfile npm gerado; a resolução sem pinning completo não é reprodutível.
- Ainda não há rotina automatizada de rotação/recriptografia de chave mestra.
- Sem MFA e sem gerenciamento de identidade externo.
- Moeda operacional BRL, sem câmbio ou precificação automática de títulos.
- Parser OFX cobre transações STMTTRN comuns, não todos os dialetos bancários.
- Cartões têm parcelas por vencimento, mas não há conciliação formal de fechamento/liquidação por ID de fatura.
- Projeções financeiras são médias históricas, sem simulação estocástica ou análise macroeconômica.
- Sem relatórios fiscais/contábeis normativos, conciliação bancária com feed e extratos fiscais de corretoras.
- Metas são reservas analíticas, não subcontas bancárias e não transferem dinheiro.
- Isolamento financeiro por workspace é lógico, não PostgreSQL RLS; validações de acesso residem na API.
- Testes de recuperação de desastres não foram executados; backup não é garantia de restauração até testado.

**Conclusão:** o pacote é uma base funcional implementada, mas **não há evidência suficiente para afirmar prontidão comercial, operação 100% homologada ou conformidade de segurança para dados reais sensíveis**. Para adoção, cumpra os critérios de aceitação do README.


## Onboarding e aceitação integrada da release 1.2.0

- Na primeira inicialização, o job `migrate` executa `scripts/check-setup.mjs` após a aplicação do esquema. O teste cria um usuário, workspace, vínculo e auditoria dentro de uma transação explicitamente revertida; nenhum dado fica persistido.
- `GET /api/setup-status` deve retornar `configured:false` antes da criação e `configured:true` depois.
- `POST /api/setup` com código correto e senha válida deve responder `200` e gravar cookie `fh_session` HttpOnly. Depois, `GET /api/me` deve retornar workspace pessoal.
- Sair e entrar novamente com a mesma senha não deve exigir recadastro. Senha de 8 a 14 caracteres é aceita para ambiente **estritamente local** mas não atende à NIST SP 800-63B-4 para fator único.
- Mensagens inesperadas de HTTP 500 têm identificador de incidente `FH-...`; o log do serviço `web` contém apenas metadados diagnósticos e SQLSTATE quando disponível.
- Caso não seja possível acessar a aplicação, execute `docker compose logs --tail=100 web migrate db` e `docker compose run --rm migrate node scripts/check-setup.mjs`. Não compartilhe segredos nem dados reais.

**Limite de validação:** estes critérios precisam ser executados no Docker do Windows 11. Não houve homologação integrada de containers no ambiente de geração da release. Para atestar, executar `scripts/acceptance.ps1` no Windows 11 com Docker Desktop.


## Gate objetivo de release

- [x] Verificação de sintaxe TS/TSX com API do TypeScript e `node --check` de scripts JS.
- [x] Testes unitários independentes do Docker: 16/16.
- [x] Estrutura do Compose analisada por parser YAML.
- [x] Sem uso da senha administrativa do PostgreSQL pelos serviços `web` e `worker` na configuração.
- [ ] Compilação completa Next.js com dependências instaladas (`npm run verify`).
- [ ] Docker build, banco, migração, autenticação e operações em execução (`scripts/acceptance.ps1`).
- [ ] Teste real de backup/restore de grande volume e restauração de permissões.
- [ ] Testes de UX em navegador, acessibilidade e revisão de dependências/CVEs.

**Decisão:** não classificar como homologada para uso com dados financeiros reais até fechar os gates marcados como pendentes.

## Contrato de instalação da versão 1.2.0

- Construção do Dockerfile: o estágio `builder` executa `mkdir -p /app/public` antes do build do Next.js. O contexto também inclui `public/.gitkeep`. Assim, o `COPY --from=builder ... /app/public ./public` não depende de um diretório vazio omitido no arquivo ZIP.
- Instalação limpa: o `scripts/start.ps1` chama `init.ps1` (cria segredos ausentes), valida Compose, executa `docker compose up --build -d` (recria PostgreSQL quando necessário), aguarda o healthcheck e exige resposta válida de `setup-status`.
- Reset explícito: `scripts/start.ps1 -ResetData -ConfirmReset` remove volumes gerenciados pelo projeto antes de reconstruir. A opção `-RotateSetupCode` regenera somente o código de primeiro acesso, preservando chaves de backup que possam ser necessárias à recuperação.
- Atualização sobre dados existentes: use `scripts/upgrade.ps1` ou `scripts/start.ps1` sem `-ResetData`. Reinicialização sem `--volumes` preserva o banco.
- Teste integrado: `scripts/acceptance.ps1` usa um projeto Compose isolado com banco novo. Requer execução no computador Windows com Docker Desktop, que não está acessível a este ambiente.

Os testes estáticos e unitários não substituem um build Docker de ponta a ponta nem um ensaio real de restauração. A versão não deve ser declarada homologada em uma máquina antes da execução de `scripts/start.ps1` e `scripts/acceptance.ps1` nessa máquina.
