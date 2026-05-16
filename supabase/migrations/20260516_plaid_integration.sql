-- Plaid Integration: store linked bank connections and sync metadata

-- Store Plaid items (one per bank connection)
CREATE TABLE IF NOT EXISTS plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaid_item_id TEXT NOT NULL UNIQUE,
  plaid_access_token TEXT NOT NULL,
  institution_id TEXT,
  institution_name TEXT,
  status TEXT DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their Plaid items" ON plaid_items
  FOR ALL USING (auth.uid() = owner_id);

-- Link Plaid accounts to financial_accounts
ALTER TABLE financial_accounts
  ADD COLUMN IF NOT EXISTS plaid_account_id TEXT,
  ADD COLUMN IF NOT EXISTS plaid_item_id TEXT,
  ADD COLUMN IF NOT EXISTS plaid_last_synced TIMESTAMPTZ;

-- Transactions: add plaid_transaction_id to avoid duplicates
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT UNIQUE;
