# Arquitetura Finance Hub 1.0

## Visão geral

```text
Windows 11 + Docker Desktop / WSL2
  localhost:3000
       │
       ▼
  Next.js (UI, API, Auth, RBAC, Analytics)
       │                │
       │             AES-GCM field encryption
       │                │ master_key in Docker Secret
       ▼                ▼
  PostgreSQL 17 ◀── Worker de lançamentos programados
       │
       └── container de backup sob demanda
             └── pg_dump → AES-256-GCM → backups/*.fhbak
```

## Modelo operacional

- Monólito modular, 1 frontend/API e 1 worker, 1 PostgreSQL. Sem Redis, Kafka, serviços externos nem integração obrigatória.
- Isolamento lógico de dados pelo identificador `workspace_id`, validado na API através de `members`.
- Moeda transacional no ledger de cada workspace: BRL. Campos `currency` estão preparados para extensão, mas transações multimoeda **não são permitidas nesta implementação**.
- Saldos de conta: `initial_cents + sum(ledger_entries.amount_cents)`.
- Lançamentos financeiros: `transactions` contém o evento; `ledger_entries` contém a alteração de saldo bancário.
- Transferências geram lançamentos de igual magnitude e sinais opostos, de modo que não alteram a riqueza consolidada.
- Estornos geram entradas de sinal contrário; eventos financeiros originais são preservados para auditoria.
- Compra de cartão: `card_purchases` cria cronograma em `card_installments` e reconhece a despesa na compra. Pagamento cria redução do saldo de conta sem reconhecer novamente uma despesa.
- Investimentos: `trades` representa posição patrimonial; operações com conta associada geram saída/entrada de caixa no ledger. Valor de mercado depende de `asset_prices` e fallback para último preço unitário.
- Documentos empresariais: contas a pagar e a receber compõem o balanço até serem liquidadas; liquidação cria transação financeira e atualiza status do documento.
- Dívidas: saldo principal controlado em `debts`; amortizações representam redução de principal e consumo de caixa, com juros pagos discriminados.
- Recorrências: `schedules` guarda lançamentos programados. `schedule_runs` impõe idempotência por competência.
- Analytics: consultas SQL agregadas, sem replicar dados em data warehouse; projeção e insights usam regras determinísticas.
- Backups: formato PostgreSQL custom autenticado com AES-GCM e segredo distinto daquele usado na criptografia de campos.

## Garantias e não garantias

- Consistência transacional do PostgreSQL nos fluxos financeiros com múltiplas operações.
- Criptografia de **campos selecionados**, não de todos os dados de domínio; segredos isolados em arquivos Docker.
- Não é contabilidade de partidas dobradas integral nem solução de escrituração fiscal empresarial.
- Não é possível aprovar produto para uso empresarial regulado apenas pela existência destas camadas; faltam threat modeling formal, hardening de ambiente, testes de penetração, avaliação legal e evidência de restauração.
- Segurança dos dados em repouso depende do BitLocker/volume físico e da administração do host.

## Decisões arquiteturais

1. Adotar Next.js com output standalone e Docker para reduzir dependências operacionais (deployment suportado oficialmente).
2. PostgreSQL como fonte única da verdade para transações e indicadores analíticos.
3. Criptografia de campos por workspace com HKDF + AES-256-GCM, IV aleatório por gravação e autenticação de integridade.
4. Sessões opacas armazenadas como hash, com expiração e revogação.
5. Não enviar dados a APIs de IA, feeds externos ou provedores de nuvem.
6. Dashboard orientado a dados reais, não exemplos demonstrativos por padrão.

## Contratos HTTP

- `GET /api/health` — readiness do banco.
- `GET /api/setup-status`, `POST /api/setup` — bootstrap único.
- `POST /api/login`, `POST /api/logout`, `GET /api/me` — identidade.
- `POST /api/workspaces` — criar contexto.
- `GET /api/overview?workspace=<uuid>` — KPIs/relatórios por workspace.
- `GET /api/data?workspace=<uuid>&entity=<entity>&offset=<int>` — listas paginadas.
- `POST /api/manage?workspace=<uuid>` — entidades CRUD permitidas.
- `POST /api/transaction`, `/api/transaction/void` — dinheiro e estornos.
- `POST /api/card/purchase`, `/api/card/payment`, `/api/card/void` — crédito.
- `POST /api/trade`, `/api/price` — carteira e marcação manual.
- `POST /api/invoice/settle`, `/api/invoice/void` — documentos.
- `POST /api/debt/payment` — amortização de contrato.
- `POST /api/import` — CSV ou OFX.
- `POST /api/member` — permissões por workspace.

Todas as operações autenticadas exigem escopo de workspace; mudanças exigem cookie de sessão válido, Origin aceito e autorização adequada.


## Segurança PostgreSQL (release 1.1)

`db` é inicializado pelo papel dono `financehub`, com segredo `db_password`. Só `migrate` (migração, grants e testes de schema) e `backup` precisam da credencial privilegiada. `web` e `worker` usam `financehub_app` (segredo `app_password`) com `SELECT/INSERT/UPDATE/DELETE` nas tabelas e acesso às sequências, sem privilégios administrativos. Usuários financeiros são isolados logicamente por membership de workspace no backend; não há RLS PostgreSQL. Backups restaurados exigem reexecutar `migrate` para conceder permissões ao papel restrito.
