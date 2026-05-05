-- UC10: extended claim metadata — the full set of fields the employee
-- types into the New Expense Claim form, kept alongside what OCR extracts
-- so the audit can diff claimed-vs-extracted as an integrity signal.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS claimed_amount    NUMERIC(18,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS claimed_date      DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS claimed_merchant  TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS claimed_gstin     TEXT;
-- Employee context captured at submit time (denormalised from users so
-- retroactive profile edits don't rewrite history on existing claims).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS employee_name     TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS department        TEXT;
