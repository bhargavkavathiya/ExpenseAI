-- Supporting indexes for hot queries.

CREATE INDEX IF NOT EXISTS ix_expenses_user_submitted ON expenses (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS ix_expenses_status        ON expenses (status);
CREATE INDEX IF NOT EXISTS ix_expenses_submitted_at  ON expenses (submitted_at DESC);

CREATE INDEX IF NOT EXISTS ix_receipt_files_expense  ON receipt_files (expense_id);

CREATE INDEX IF NOT EXISTS ix_ai_invocations_expense ON ai_invocations (expense_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ai_invocations_module  ON ai_invocations (module, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_audit_logs_seq         ON audit_logs (seq);
CREATE INDEX IF NOT EXISTS ix_audit_logs_expense     ON audit_logs (expense_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_ts          ON audit_logs (ts DESC);

CREATE INDEX IF NOT EXISTS ix_review_queue_status    ON review_queue (status, created_at);

-- 90-day duplicate-detection lookup: user_id + created_at DESC.
CREATE INDEX IF NOT EXISTS ix_duplicate_hashes_user_ts ON duplicate_hashes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_duplicate_hashes_phash   ON duplicate_hashes (phash);

CREATE INDEX IF NOT EXISTS ix_policy_rules_active    ON policy_rules (active, type);
