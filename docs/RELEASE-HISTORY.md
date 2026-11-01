## Correcao 1.3.3: Docker Desktop / PowerShell (Windows 11)

- A demo passa a executar `docker info` e `docker compose` diretamente, **sem pipelines** `| Out-Host`, `| Out-Null` ou captura da saida nativa. Algumas versoes de Docker Desktop para Windows apresentam `failed to get console: Identificador invalido` quando o console e redirecionado.
- Compose em modo sem ANSI e progresso `plain` (`--ansi never --progress plain`, suportados pelo Compose V2).
- Caso as credenciais isoladas tenham acabado de ser criadas, remove exclusivamente a demo legada, sem tocar no volume nem nos segredos operacionais. Se uma demo existente falhar no inicio, tenta **uma** recriacao apenas do banco ficticio.
- A demonstracao requer teste HTTP de saude e login antes de anunciar sucesso.
- A senha nao deve ser incluida em capturas ou logs enviados a terceiros.
- **Limite de validacao:** script revisado e testes locais realizados, mas nao foi possivel executa-lo no Docker Desktop/Windows dentro do ambiente de desenvolvimento.

# Finance Hub 1.3.2 — Release integral: credenciais isoladas e recuperacao automatica da demo

> **Correção confirmada nos logs enviados:** `42601` em quatro agregações SQL com o alias `month`. Corrigido para `AS "month"`; o frontend mantém acesso aos registros mesmo quando uma consulta analítica falha. O endpoint de saúde agora verifica a execução do analytics completo em um workspace inexistente, não somente `SELECT 1`.
>
> **Status de validação:** testes automatizados locais aprovados; execução end-to-end com Docker/PostgreSQL em Windows 11 **não foi possível neste ambiente**. Não considerar homologado para dados financeiros reais até a aceitação integrada.

## Correcao comprovada em 1.3.2 — Demo SQLSTATE 28P01

Os logs do Windows 11 mostraram que a instalacao principal em `:3000` subiu normalmente, mas a **demo** nao iniciou: o PostgreSQL reutilizou um volume anterior cujas credenciais nao coincidiam com `db_password`, produzindo `password authentication failed for user "financehub"` (`28P01`). A senha passada ao container nao altera a senha do PostgreSQL ja inicializado.

**Resolucao implementada:** `demo.ps1` agora cria todas as chaves e senhas da demonstracao em `secrets/demo/` (sem usar nem alterar segredos operacionais). O Compose da demo sobrescreve os seis caminhos de secrets e utiliza projeto/volume isolados. Na primeira atualizacao, se detectar um volume demo legado sem secrets dedicados, **recria apenas a base ficticia da demo**. Em caso de divergencia de credenciais, tenta uma recuperacao unica da propria demo. O script verifica prontidao analitica e faz login HTTP real com as credenciais geradas antes de declarar sucesso. Nao toca os volumes ou registros de `finance-hub` (producao).

Para subir ou recuperar a demo, execute `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1`. Se desejar forcar um novo dataset ficticio, use `-ResetDemo -ConfirmReset`.

**Risco operacional:** recuperar uma demo com volumes ou segredos divergentes elimina alteracoes feitas anteriormente no **ambiente demonstrativo**. Nunca utilize informacoes financeiras reais na demo. Os segredos da instalacao real permanecem intactos. O trabalho foi verificado por testes de codigo/contratos; teste end-to-end Docker no Windows nao foi realizado neste ambiente.

## Refinamento visual — tema escuro (1.3.1)

- Corrigida a causa-raiz da tipografia invisível no modo escuro: a cor do texto passa a ser resolvida explicitamente no contêiner `.app-shell`.
- Ajustados os tokens de contraste para títulos, indicadores, cabeçalhos, legendas, valores, avisos, formulários e menus.
- Eixos, grades e legendas dos gráficos Recharts passam a respeitar o tema ativo.
- O modo escolhido fica salvo localmente no navegador; basta clicar no ícone de sol/lua para alternar.
- Rótulos centrais de gráficos circulares agora refletem investimentos, patrimônio, obrigações e empresa, evitando a legenda incorreta “Gastos do mês” nessas visões.
- Módulos financeiros, APIs, banco, migrações, segredos, scripts de demonstração e dados fictícios permanecem da mesma base 1.3.0.

## 1. Atualizar a sua instalação, preservando dados

Extraia **o ZIP integral** sobre a pasta `finance-hub` (mantenha `secrets/` e `backups/` existentes). Na pasta do projeto, execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upgrade.ps1
```

Depois abra `http://localhost:3000`. É esperado que `/api/health` retorne:

```json
{"status":"ok","database":"ready","analytics":"ready"}
```

Se você preferir resetar propositalmente a instalação:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -ResetData -ConfirmReset -RotateSetupCode
```

**Atenção:** excluir volumes remove todos os dados daquele banco, não impede uma instalação limpa. O reset operacional não exclui o banco separado da demo.

## 2. Demonstração completa (dados fictícios)

No PowerShell, na mesma pasta do projeto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1
```

- Endereço da demo: **http://localhost:3100**.
- E-mail: **demo@financehub.local**.
- **Senha:** gerada aleatoriamente por `demo.ps1`, exibida ao final e mantida exclusivamente em `secrets/demo/demo_password`.
- Ambientes disponíveis: **Finanças pessoais, Família e Empresa modelo**.
- Dataset: doze meses de movimentações, contas, saldos, cartões, parcelamentos, 3 ativos de investimento e cotações, dividendos, bens, financiamentos, orçamento por categoria, assinaturas, regras de categorização, compromissos, clientes, fornecedores, documentos e oportunidades comerciais.
- **Isolamento:** o script usa o projeto Compose `financehub-demo`, com volume PostgreSQL dedicado e porta 3100. Nunca insere dados fictícios na base financeira real. O banco da demo é reusado em execuções posteriores, exceto na primeira migração de uma demo antiga sem credenciais próprias ou quando a autenticação da base fictícia fica divergente; nesses casos, o script recria apenas os dados da demo.

Para validar via API a demo **sem tocar nos dados reais** (o teste realiza operações no próprio banco demo):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo-verify.ps1
```

Para reconstruir a demo e apagar apenas seu volume:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1 -ResetDemo -ConfirmReset
```

Parar somente a demo sem remover o banco:

```powershell
docker compose -p financehub-demo -f compose.yaml -f compose.demo.yaml down
```

O projeto operacional (`finance-hub`) em `localhost:3000` continua independente. **Não use dados reais no ambiente demonstrativo**, mesmo com senha aleatória.

## 3. Critérios objetivos de aceite

1. Build `docker compose up --build -d` (operacional) sem erros.
2. `/api/health` deve retornar `analytics=ready`.
3. Demo deve permitir login, alternar entre três workspaces e navegar nos 12 dashboards analíticos com dados.
4. `demo-verify.ps1` deve exercitar todos os endpoints de listagem e as operações de escrita principais.
5. `acceptance.ps1` deve aprovar cadastro, transações, cartões, isolamento e permissões.
6. Antes de uso com dados reais: backup/restauração, desempenho e verificação de segurança devem ser realizados na instalação-alvo.

---

# Histórico e arquitetura da distribuição integral

Sistema self-hosted de gestão financeira pessoal, familiar e empresarial. Arquitetura: Next.js + React + TypeScript, PostgreSQL 17, Docker Compose, worker de automações e backup AES-256-GCM.

> **Status de validação:** código integral revisado, testes unitários e verificações de sintaxe executados. **Esta versão não possui homologação end-to-end confirmada no Windows 11**: o ambiente de geração não dispõe de Docker Engine nem de acesso ao registro npm. Não é correto prometer ausência absoluta de defeitos ou prontidão para dados financeiros reais sem passar no ensaio integrado abaixo. O pacote é completo, não um patch incremental.

## Correções e reforços da versão 1.3.0

- Corrigida referência inválida (`mode`) no modal que podia impedir a compilação do frontend.
- Middleware CSP adaptado ao runtime Edge do Next.js, sem depender de `Buffer`.
- Primeiro cadastro: correção de escrita da auditoria, sessão imediata e autodiagnóstico transacional no PostgreSQL.
- Segurança: **web e worker deixam de utilizar a conta superusuária do PostgreSQL**. A migração cria e atualiza a credencial de `financehub_app`, com privilégios de leitura/gravação sobre tabelas e sequências, mas sem `SUPERUSER`, `CREATEDB` ou `CREATEROLE`.
- Verificação mais estrita de datas, documentos quitados, saldo inicial de contas com movimentos, amortizações, cotações, taxas de investimentos e parcelamentos pequenos.
- Backups: restauração agora usa streaming autenticado para evitar carregar o backup inteiro na memória; corrigida corrida de eventos no processo `pg_dump`.
- Interface: perfis de leitura deixam de receber controles de edição nos módulos financeiros.
- Adicionado `scripts/acceptance.ps1`, que cria **outro projeto Compose** e testa cadastro, sessão, saldo, estorno, parcelamento, isolamento de workspace e RBAC, sem acessar o banco operacional.
- Dependências e testes estão em `package.json`, com `npm run verify` para build/checagem após a instalação das dependências.
- **Dockerfile corrigido:** o builder sempre cria `/app/public` antes da compilação, mesmo quando nenhum recurso estático é distribuído. O ZIP inclui também `public/.gitkeep` para que o build não dependa de uma pasta vazia.
- **Inicialização única:** `scripts/start.ps1` gera os segredos ausentes, valida o Compose, constrói os serviços, espera a migração e confirma os endpoints `health` e `setup-status`.
- **Reset de volume suportado:** `scripts/start.ps1 -ResetData -ConfirmReset` exclui o banco local e recria uma instalação limpa. `-RotateSetupCode` regenera o código de primeiro acesso após o reset.
- **Teste de contrato de empacotamento:** regressão específica para a falha de `COPY /app/public`, adicionada à suíte automatizada.

### Instalação nova (Windows 11)

No PowerShell na pasta extraída:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

O instalador gera os segredos necessários, aplica as migrações, aguarda a API e imprime o código de instalação. Abra `http://localhost:3000`, informe o código exibido, nome, e-mail e senha (mínimo 8 caracteres, recomendado 15 ou mais). Se a inicialização falhar, ele próprio imprime o diagnóstico dos serviços.

**Instalação zerada, inclusive se quiser excluir volumes existentes:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -ResetData -ConfirmReset -RotateSetupCode
```

Esse comando recria o banco, esquema e conta inicial a partir do zero. `-ResetData` apaga **irreversivelmente os dados do volume PostgreSQL desta instância**; não apaga a pasta de backups. `-RotateSetupCode` gera novo código inicial, útil especialmente se o código anterior foi exposto. Para recuperar dados após apagar o volume, restaure um backup que possua a chave correspondente. **O produto funciona sem volumes antigos, mas dados antigos não reaparecem automaticamente.**

### Atualização a partir de 1.0.x sem apagar o banco

**Primeiro, guarde backup dos dados e cópia offline dos segredos.** Extraia os arquivos sobre o mesmo diretório `finance-hub`, sem substituir `secrets/`, sem mudar o nome do projeto Compose e sem executar comandos de remoção de volumes. Execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upgrade.ps1
```

O script **preserva** `db_password`, `master_key`, `backup_key` e `setup_code` e cria somente o novo `app_password` quando necessário. A migração cria a conta restrita sem alterar seus dados financeiros. Se sua intenção for **preservar os registros existentes**, não elimine o volume. Para zerar deliberadamente o banco, o reset está suportado.

### Aceitação integrada obrigatória antes de dados financeiros reais

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\acceptance.ps1
```

Este script usa uma porta de teste separada (`3107`) e um nome de projeto Docker aleatório `financehub-acceptance-*`; ele **não reutiliza o volume de dados em produção**. O banco de teste permanece para análise (nenhum comando destrutivo de limpeza é executado). A execução precisa finalizar com `ACEITAÇÃO APROVADA`. Além disso, teste backup/restauração em ambiente isolado e faça inspeção das telas no navegador.

## 1. Pré-requisitos — Windows 11

1. Instale **Docker Desktop para Windows**, habilite **WSL 2**, selecione Linux containers e aguarde o Docker Engine ficar ativo.
2. Abra **PowerShell** na pasta extraída do projeto. Conexão à internet é necessária no primeiro build para baixar imagens e dependências do npm.
3. Habilite **BitLocker** na unidade do Windows que armazena os dados Docker/WSL e a pasta de backups. A criptografia de alguns campos da aplicação **não** substitui proteção integral do volume do PostgreSQL.
4. Reserve, como referência operacional, 4 GB de memória livres e 5 GB de disco inicial (não é um benchmark medido; armazenamento cresce com as transações).

## 2. Instalação

No PowerShell, dentro de `finance-hub`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

Abra **http://localhost:3000**. Na primeira execução, informe seu nome, e-mail, senha de **8 caracteres ou mais** (recomendação: frase-senha de 15+ caracteres) e **código de instalação** exibido pelo script `init.ps1`.

O instalador gera cinco segredos em `secrets/`, que **não** são incluídos no ZIP:

- `db_password` — senha administrativa do PostgreSQL (somente migration e backup).
- `app_password` — senha do papel restrito `financehub_app` (web e worker).
- `master_key` — derivação de chaves criptográficas por workspace para campos sensíveis.
- `setup_code` — autorização da primeira conta administrativa.
- `backup_key` — criptografia de arquivos de backup (separada da chave da aplicação).

**O script mantém chaves preexistentes; a rotação do código de instalação só ocorre explicitamente no reset.** O script é idempotente e preserva segredos existentes. Guarde cópia offline segura de `master_key` e `backup_key`; a perda dessas chaves pode tornar dados ou backups irrecuperáveis. Não suba `secrets/` para Git, nuvem, pasta compartilhada ou repositórios públicos.

Para verificar o ambiente:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Resultado esperado: `{ "status": "ok", "database": "ready" }`.

**Acesso restrito a este PC:** a porta está vinculada a `127.0.0.1`, portanto não há exposição de acesso na rede local nem na internet. Para acesso remoto, é preciso desenhar autenticação, HTTPS, DNS e proxy reverso antes de mudar a publicação.

## 3. Como começar

1. Faça login como proprietário.
2. Cadastre uma conta em **Contas & saldos**, com o saldo inicial da data de referência.
3. Em **Movimentações**, registre receitas, despesas e transferências.
4. Cadastre cartões, compras e parcelamentos em **Cartões & faturas**; pagamentos de fatura reduzem o saldo bancário, mas **não** contam novamente como despesa.
5. Configure orçamentos e metas. A alocação às metas é um registro de reserva **analítica**, sem transferir dinheiro entre contas.
6. Cadastre ativos e operações em **Investimentos**, informando cotações manuais quando aplicável.
7. Crie espaço **Empresarial** para separar clientes, fornecedores, documentos a receber/pagar e pipeline de oportunidades.
8. Explore **Dashboards & BI** para comparações, cenários e alertas.
9. Em **Automações**, crie regras de categorização e, se desejar, habilite expressamente lançamentos recorrentes.

### Importação CSV

CSV UTF-8 com cabeçalho obrigatório `date,description,amount,kind`:

```csv
date,description,amount,kind
2026-10-01,Salario,8000.00,income
2026-10-04,Supermercado,225.30,expense
```

O campo `amount` é positivo, em reais, com **ponto** decimal. `kind` = `income` ou `expense`. Aceita até 2.500 linhas e 1 MB por lote. O sistema calcula hash de deduplicação por conta, data, tipo, valor e descrição, e indica linhas rejeitadas. Regras ativas de categorização aplicam-se na importação.

### Importação OFX

Compatibilidade inicial com transações bancárias `<STMTTRN>` que contenham `DTPOSTED`, `TRNAMT`, `NAME`/`MEMO`. OFX 1.x e 2.x variam entre bancos; validar o arquivo da sua instituição na homologação. Não existe integração automática Open Finance neste pacote. **Nunca envie extratos bancários reais para serviços públicos de testes.**

### Investimentos

Lançamentos de compra, venda, dividendos e taxas. Posição calculada por quantidade e custo médio ponderado. Venda maior que posição registrada é bloqueada. Cotação usa último preço manual, senão último preço negociado — **estimativa**, não feed de mercado. Se a operação usar conta bancária, os fluxos de caixa são refletidos no saldo; se não indicar conta, a operação permanecerá no controle patrimonial sem movimentar dinheiro.

### Automações e regras

- Categorização usa `includes`, sem regex arbitrária e sem envio de dados a terceiros.
- Lançamentos programados iniciam **desabilitados**; só são executados após habilitação explícita no cadastro.
- Worker revisa agendamentos a cada minuto; execução protegida por bloqueio transacional e chave única `(schedule_id,due_on)`.
- Agendamentos retroativos habilitados podem produzir lançamentos para todas as competências vencidas (limitados a 500 por rodada). Revise a data de início antes de habilitar.

## 4. Backups criptografados e recuperação

A rotina de backup usa `pg_dump` custom format e criptografia **AES-256-GCM** com chave independente. Arquivos ficam em `./backups` e têm extensão `.fhbak`.

Backup manual:

```powershell
docker compose --profile tools run --build --rm backup backup
```

Veja o nome gerado:

```powershell
Get-ChildItem .\backups\*.fhbak
```

Restauração, **destrutiva** para o banco atual (faça backup antes):

```powershell
docker compose stop web worker
docker compose --profile tools run --rm backup restore financehub-AAAA-MM-DDTHH-MM-SS-sssZ.fhbak --confirm=RESTORE
docker compose run --rm migrate
docker compose up -d web worker
```

Substitua pelo nome real. Backup criptografa o dump e valida a integridade antes de restaurar. Armazene cópias **offline** dos backups e das chaves em locais separados. **Execute um restore de teste em ambiente isolado antes de depender operacionalmente do backup.** Não é oferecida recuperação granular ou PITR na versão 1.0.

Para consultar recursos:

```powershell
docker compose ps
docker compose logs --tail=200 web
docker compose logs --tail=200 worker
docker compose logs --tail=200 db
```

Para atualizar código mantendo os volumes:

```powershell
docker compose up -d --build
```

**É permitido** apagar os volumes e iniciar novamente. Isso cria um banco vazio; utilize `scripts/start.ps1 -ResetData -ConfirmReset` para automatizar a operação ou `docker compose down -v` manualmente, seguido de `scripts/start.ps1`. Se houver dados a recuperar, restaure um backup compatível.

## 5. Mapa de dashboards

1. Executivo — patrimônio, liquidez, receitas, despesas, resultado, despesas por categoria, sinais.
2. Fluxo de caixa — evolução por competência e comparativo mensal.
3. Despesas — ranking e tendências por categoria.
4. Orçamentos — planejado versus realizado, desvios e utilização.
5. Crédito — cartão, compromissos, limite e pagamentos registrados.
6. Investimentos — posições, custo médio, preços estimados, lucro/prejuízo não realizado.
7. Patrimônio — composição de ativos e passivos.
8. Passivos — dívidas, cartões e documentos a pagar.
9. Empresa — contas a receber/pagar e vencimentos.
10. Projeções — extrapolação determinística de médias mensais.
11. Oportunidades — pipeline empresarial ponderado por probabilidade.
12. Insights — condições detectadas, alertas e despesas recorrentes.

Os indicadores são agregados sob o **workspace ativo**. Não há consolidação entre espaços, razão contábil societária fiscal, declaração de imposto de renda, emissão de NF-e, integração PIX/Open Finance, cotação de mercado automática ou IA generativa embutida nesta versão.

## 6. Proteções e limitações de segurança

| Camada | Implementação |
|---|---|
| Autenticação | E-mail/senha com hash bcrypt custo 12; primeiro acesso com código de instalação |
| Sessões | Token aleatório de 256 bits; somente hash SHA-256 no banco; cookie HttpOnly e SameSite Strict, duração 12h |
| Acesso | Membership por workspace, owner/admin/editor/viewer, escopo em consultas e alterações |
| Proteção de conteúdo | AES-256-GCM por campo (descrições, contrapartes, dados bancários opcionais, observações e dados pessoais dos contatos); HKDF-SHA256 por workspace |
| Defesa browser | CSP com nonce em requests HTML, bloqueio de iframes, `nosniff`, política restritiva de permissões |
| CSRF | Origin check em operações POST, sem CORS permissivo; cookies SameSite Strict |
| Banco | Rede Docker interna, PostgreSQL sem exposição de porta; `financehub_app` sem `SUPERUSER`; dono/superusuário isolado em migration/backup |
| Containers | Sem privilégios adicionais, web/worker com filesystem somente leitura, web como usuário não-root |
| Auditoria | Registros de criação, alteração, estorno, operações, agendamentos e acessos administrativos |
| Backup | AES-256-GCM autenticado com chave separada; restauração explicitamente confirmada |

**Avisos essenciais:** valores monetários, saldos, datas, categorias, nomes de contas e metadados analíticos ficam **em claro no PostgreSQL** para permitir agregações e consultas; sua proteção integral em repouso exige criptografia do armazenamento, como BitLocker, e gestão segura de chaves. Uma máquina Windows comprometida, um administrador host malicioso ou acesso privilegiado ao processo da aplicação pode expor informações. Não existe HSM, KMS dedicado, rotação automática, MFA, antimalware nem certificação de conformidade neste pacote. HTTPS não está habilitado porque o endereço é exclusivamente loopback; habilite TLS antes de expor em rede.

Dependências npm são resolvidas durante o build porque não foi possível gerar/validar um lockfile neste ambiente sem acesso ao npm. Antes de uso sensível, gere e versione `package-lock.json`, utilize `npm ci` nos Dockerfiles e execute verificação de vulnerabilidades e atualização de dependências. Sem isso, a reprodutibilidade do build e a garantia de integridade de supply chain são limitadas.

## 7. Aceitação antes de dados reais

- [ ] Build Docker concluído (`docker compose up --build -d`) e health retornando `ok`.
- [ ] Cadastro de proprietário, login, logout e bloqueio de credenciais erradas.
- [ ] Criar usuário viewer e verificar que não consegue gravar dados nem ver outro workspace.
- [ ] Receita, despesa, transferência e estorno; conferir saldos manualmente.
- [ ] Compra parcelada e pagamento; conferir que não há despesa em dobro.
- [ ] Importação CSV duas vezes; conferir deduplicação.
- [ ] Investimentos: compra, cotação, venda parcial e rejeição de venda excessiva.
- [ ] Documento empresarial: emitir, quitar e verificar saldo e dashboard.
- [ ] Dívida: amortizar e conferir principal/juros.
- [ ] Agendamento: criar desabilitado; habilitar apenas após verificar data.
- [ ] Backup criptografado; cópia; restore em banco isolado; conferir integridade dos campos criptografados com a chave correta.
- [ ] Modo escuro, pesquisa, exportação CSV, responsividade e CSP (console do navegador sem violações críticas).

**Suporte:** documentação de arquitetura em `docs/ARCHITECTURE.md` e relatório de limites em `docs/VALIDATION.md`.
