-- Add missing account_type enum values that the frontend supports
-- but were not included in the original enum definition.
-- Using IF NOT EXISTS pattern via DO blocks to make this migration idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'auto_loan' AND enumtypid = 'account_type'::regtype) THEN
    ALTER TYPE account_type ADD VALUE 'auto_loan';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cd' AND enumtypid = 'account_type'::regtype) THEN
    ALTER TYPE account_type ADD VALUE 'cd';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'other' AND enumtypid = 'account_type'::regtype) THEN
    ALTER TYPE account_type ADD VALUE 'other';
  END IF;
END
$$;
