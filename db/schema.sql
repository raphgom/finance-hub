BEGIN;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text NOT NULL,
 password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash char(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_attempts (
 id bigserial PRIMARY KEY, identifier text NOT NULL, ip_hash char(64) NOT NULL,
 attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_window_idx ON login_attempts(identifier, attempted_at DESC);
CREATE TABLE IF NOT EXISTS workspaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, kind text NOT NULL CHECK(kind IN ('personal','family','business')),
 currency char(3) NOT NULL DEFAULT 'BRL', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS members (
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('owner','admin','editor','viewer')), PRIMARY KEY(workspace_id,user_id)
);
CREATE INDEX IF NOT EXISTS members_user_idx ON members(user_id);
CREATE TABLE IF NOT EXISTS accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, kind text NOT NULL DEFAULT 'checking', initial_cents bigint NOT NULL DEFAULT 0,
 currency char(3) NOT NULL DEFAULT 'BRL', details_enc text, archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,workspace_id)
);
CREATE INDEX IF NOT EXISTS accounts_workspace_idx ON accounts(workspace_id);
CREATE TABLE IF NOT EXISTS categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, kind text NOT NULL CHECK(kind IN ('income','expense')),
 color text NOT NULL DEFAULT '#7C94F6', UNIQUE(workspace_id,name,kind), UNIQUE(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 account_id uuid NOT NULL, to_account_id uuid, category_id uuid,
 kind text NOT NULL CHECK(kind IN ('income','expense','transfer')),
 amount_cents bigint NOT NULL CHECK(amount_cents>0), occurred_on date NOT NULL,
 description_enc text NOT NULL, counterparty_enc text, source text NOT NULL DEFAULT 'manual', fingerprint char(64),
 voided_at timestamptz, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (account_id, workspace_id) REFERENCES accounts(id,workspace_id),
 FOREIGN KEY (to_account_id, workspace_id) REFERENCES accounts(id,workspace_id),
 FOREIGN KEY (category_id, workspace_id) REFERENCES categories(id,workspace_id),
 CHECK (kind<>'transfer' OR (to_account_id IS NOT NULL AND to_account_id <> account_id))
);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_import_fingerprint ON transactions(workspace_id,fingerprint) WHERE fingerprint IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_scope_date_idx ON transactions(workspace_id,occurred_on DESC);
CREATE TABLE IF NOT EXISTS ledger_entries (
 id bigserial PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id),
 account_id uuid NOT NULL, transaction_id uuid REFERENCES transactions(id),
 reference text, amount_cents bigint NOT NULL CHECK(amount_cents<>0), effective_on date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (account_id, workspace_id) REFERENCES accounts(id,workspace_id)
);
CREATE INDEX IF NOT EXISTS ledger_account_idx ON ledger_entries(account_id,effective_on);
CREATE TABLE IF NOT EXISTS cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, brand text, limit_cents bigint NOT NULL DEFAULT 0 CHECK(limit_cents>=0),
 closing_day integer NOT NULL DEFAULT 1 CHECK(closing_day BETWEEN 1 AND 28),
 due_day integer NOT NULL DEFAULT 10 CHECK(due_day BETWEEN 1 AND 28), archived boolean NOT NULL DEFAULT false,
 UNIQUE(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS card_purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL,
 card_id uuid NOT NULL, category_id uuid,
 description_enc text NOT NULL, purchased_on date NOT NULL, total_cents bigint NOT NULL CHECK(total_cents>0),
 installments integer NOT NULL CHECK(installments BETWEEN 1 AND 120), voided_at timestamptz,
 FOREIGN KEY (card_id,workspace_id) REFERENCES cards(id,workspace_id),
 FOREIGN KEY (category_id,workspace_id) REFERENCES categories(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS card_installments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id uuid NOT NULL REFERENCES card_purchases(id) ON DELETE CASCADE,
 installment_no integer NOT NULL, due_on date NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>0),
 UNIQUE(purchase_id, installment_no)
);
CREATE INDEX IF NOT EXISTS installment_due_idx ON card_installments(due_on);
CREATE TABLE IF NOT EXISTS card_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL,
 card_id uuid NOT NULL, account_id uuid NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>0),
 paid_on date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(card_id,workspace_id) REFERENCES cards(id,workspace_id),
 FOREIGN KEY(account_id,workspace_id) REFERENCES accounts(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL,
 category_id uuid NOT NULL, period char(7) NOT NULL CHECK(period ~ '^\d{4}-\d{2}$'),
 limit_cents bigint NOT NULL CHECK(limit_cents>=0), UNIQUE(workspace_id,category_id,period),
 FOREIGN KEY (category_id,workspace_id) REFERENCES categories(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS goals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, target_cents bigint NOT NULL CHECK(target_cents>0), allocated_cents bigint NOT NULL DEFAULT 0 CHECK(allocated_cents>=0),
 target_on date, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 symbol text NOT NULL, name text NOT NULL, asset_class text NOT NULL,
 currency char(3) NOT NULL DEFAULT 'BRL', UNIQUE(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS trades (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL,
 asset_id uuid NOT NULL, account_id uuid, kind text NOT NULL CHECK(kind IN ('buy','sell','dividend','fee')),
 quantity numeric(24,8) NOT NULL DEFAULT 0 CHECK(quantity>=0), unit_price_cents bigint NOT NULL DEFAULT 0 CHECK(unit_price_cents>=0),
 total_cents bigint NOT NULL DEFAULT 0 CHECK(total_cents>=0), fees_cents bigint NOT NULL DEFAULT 0 CHECK(fees_cents>=0),
 traded_on date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (asset_id,workspace_id) REFERENCES assets(id,workspace_id),
 FOREIGN KEY (account_id,workspace_id) REFERENCES accounts(id,workspace_id)
);
CREATE INDEX IF NOT EXISTS trades_asset_date ON trades(asset_id,traded_on);
CREATE TABLE IF NOT EXISTS asset_prices (
 asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE, priced_on date NOT NULL,
 price_cents bigint NOT NULL CHECK(price_cents>=0), source text NOT NULL DEFAULT 'manual', PRIMARY KEY(asset_id,priced_on)
);
CREATE TABLE IF NOT EXISTS holdings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, kind text NOT NULL, value_cents bigint NOT NULL CHECK(value_cents>=0),
 valued_on date NOT NULL, notes_enc text
);
CREATE TABLE IF NOT EXISTS debts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, principal_cents bigint NOT NULL CHECK(principal_cents>=0),
 remaining_cents bigint NOT NULL CHECK(remaining_cents>=0), annual_rate numeric(9,5) NOT NULL DEFAULT 0,
 payment_cents bigint NOT NULL DEFAULT 0, due_day integer NOT NULL DEFAULT 10 CHECK(due_day BETWEEN 1 AND 28),
 notes_enc text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS debt_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), debt_id uuid NOT NULL REFERENCES debts(id),
 paid_on date NOT NULL, principal_cents bigint NOT NULL CHECK(principal_cents>=0),
 interest_cents bigint NOT NULL DEFAULT 0 CHECK(interest_cents>=0),
 account_id uuid REFERENCES accounts(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>0), cadence text NOT NULL CHECK(cadence IN ('monthly','yearly','weekly')),
 next_on date NOT NULL, category_id uuid REFERENCES categories(id), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','cancelled'))
);
CREATE TABLE IF NOT EXISTS contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, kind text NOT NULL CHECK(kind IN ('customer','vendor','both')),
 email_enc text, tax_id_enc text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 contact_id uuid, number text NOT NULL, direction text NOT NULL CHECK(direction IN ('receivable','payable')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('draft','open','paid','void')),
 amount_cents bigint NOT NULL CHECK(amount_cents>0), issued_on date NOT NULL, due_on date NOT NULL,
 paid_on date, transaction_id uuid REFERENCES transactions(id),
 FOREIGN KEY (contact_id,workspace_id) REFERENCES contacts(id,workspace_id), UNIQUE(workspace_id,number,direction)
);
CREATE TABLE IF NOT EXISTS opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, contact_id uuid REFERENCES contacts(id), stage text NOT NULL DEFAULT 'lead',
 expected_cents bigint NOT NULL CHECK(expected_cents>=0), probability integer NOT NULL DEFAULT 50 CHECK(probability BETWEEN 0 AND 100),
 expected_on date, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS automation_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, pattern text NOT NULL, category_id uuid NOT NULL REFERENCES categories(id),
 enabled boolean NOT NULL DEFAULT true, priority integer NOT NULL DEFAULT 100, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 account_id uuid NOT NULL, category_id uuid, kind text NOT NULL CHECK(kind IN ('income','expense')),
 amount_cents bigint NOT NULL CHECK(amount_cents>0), description_enc text NOT NULL,
 cadence text NOT NULL CHECK(cadence IN ('monthly','weekly','yearly')),
 next_on date NOT NULL, anchor_day integer NOT NULL DEFAULT 1 CHECK(anchor_day BETWEEN 1 AND 31), enabled boolean NOT NULL DEFAULT false,
 FOREIGN KEY(account_id,workspace_id) REFERENCES accounts(id,workspace_id),
 FOREIGN KEY(category_id,workspace_id) REFERENCES categories(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS schedule_runs (
 schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE, due_on date NOT NULL,
 transaction_id uuid NOT NULL REFERENCES transactions(id), PRIMARY KEY(schedule_id,due_on)
);
CREATE TABLE IF NOT EXISTS audit_events (
 id bigserial PRIMARY KEY, workspace_id uuid REFERENCES workspaces(id), actor_id uuid REFERENCES users(id),
 action text NOT NULL, entity text, entity_id text, meta jsonb NOT NULL DEFAULT '{}'::jsonb,
 happened_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_workspace_date ON audit_events(workspace_id,happened_at DESC);
COMMIT;
