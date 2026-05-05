-- UC10: user-entered claim metadata stored alongside OCR extracts.
-- These fields capture what the employee is *claiming*; OCR results remain in
-- expenses.result (JSONB) as independent verification — the audit can compare.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category     TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_mode TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS purpose      TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS city         TEXT;

CREATE INDEX IF NOT EXISTS ix_expenses_category ON expenses (category);
