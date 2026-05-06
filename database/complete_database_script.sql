-- UC10 PostgreSQL schema — runs once on first container start via
-- /docker-entrypoint-initdb.d. Idempotent guards so re-running via
-- manual psql is safe.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- enums ----------
DO $$ BEGIN
    CREATE TYPE expense_status AS ENUM ('processing','approved','needs_review','rejected','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE policy_rule_type AS ENUM ('amount_cap','category_block','require_gstin','time_window','fuzzy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE review_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE integration_health AS ENUM ('up','degraded','down','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE circuit_state AS ENUM ('closed','half_open','open');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- reference / identity ----------
CREATE TABLE IF NOT EXISTS roles (
    id          SMALLSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                TEXT NOT NULL,
    password_hash        TEXT NOT NULL,
    -- Employee profile fields captured at registration time. All optional so
    -- legacy seeded accounts (with no employee profile) keep working.
    employee_id          TEXT,
    full_name            TEXT,
    mobile               TEXT,
    department           TEXT,
    manager_name         TEXT,
    band                 TEXT,                -- FK-style link to employee_bands.code
    registration_source  TEXT,                -- 'web' | 'mobile' | 'admin' | 'hris'
    location             TEXT,
    cost_center          TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Case-insensitive uniqueness without requiring the citext extension.
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_lower   ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_employee_id   ON users (employee_id) WHERE employee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    PRIMARY KEY (user_id, role_id)
);

-- ---------- expenses & receipts ----------
CREATE TABLE IF NOT EXISTS expenses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref_id        TEXT NOT NULL UNIQUE,
    user_id       UUID NOT NULL REFERENCES users(id),
    status        expense_status NOT NULL DEFAULT 'processing',
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ,
    result        JSONB,                              -- full aggregator output
    overall_confidence NUMERIC(5,4),
    needs_review  BOOLEAN NOT NULL DEFAULT FALSE,
    review_reason TEXT,
    -- User-entered metadata at submit time (what the employee is claiming).
    category      TEXT,
    payment_mode  TEXT,
    purpose       TEXT,
    city          TEXT,
    CONSTRAINT chk_ref_id_format CHECK (ref_id ~ '^EXP-\d{4}-\d{2}-[A-Z0-9]{4}-[A-Z0-9]{4}$')
);

CREATE TABLE IF NOT EXISTS receipt_files (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id    UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    content_type  TEXT NOT NULL,
    size_bytes    BIGINT NOT NULL,
    storage_path  TEXT NOT NULL,
    phash         CHAR(16),                           -- 64-bit pHash, 16 hex chars
    uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- AI invocations & audit log ----------
CREATE TABLE IF NOT EXISTS ai_invocations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id      UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    module          TEXT NOT NULL,                    -- 'ocr'|'duplicate'|'anomaly'|'policy'|'aggregator'|'explanation'
    model_version   TEXT NOT NULL,
    prompt_version  TEXT,
    input_ref       TEXT,
    output          JSONB,
    confidence      NUMERIC(5,4),
    duration_ms     INT,
    status          TEXT NOT NULL,                    -- 'ok'|'timeout'|'circuit_open'|'error'
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only hash-chained audit log. Never UPDATE/DELETE.
CREATE TABLE IF NOT EXISTS audit_logs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq              BIGSERIAL UNIQUE NOT NULL,
    ts               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id          UUID REFERENCES users(id),
    expense_id       UUID REFERENCES expenses(id),
    module           TEXT NOT NULL,
    model_version    TEXT NOT NULL,
    prompt_version   TEXT,
    input_ref        TEXT,
    output_snapshot  JSONB NOT NULL,
    confidence       NUMERIC(5,4),
    prev_hash        CHAR(64) NOT NULL,
    hash             CHAR(64) NOT NULL
);

-- ---------- config ----------
CREATE TABLE IF NOT EXISTS policy_rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type        policy_rule_type NOT NULL,
    params      JSONB NOT NULL DEFAULT '{}'::jsonb,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    severity    TEXT NOT NULL DEFAULT 'medium',       -- 'low'|'medium'|'high'
    updated_by  UUID REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS thresholds (
    key         TEXT PRIMARY KEY,
    value       NUMERIC NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    updated_by  UUID REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- review queue ----------
CREATE TABLE IF NOT EXISTS review_queue (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id    UUID NOT NULL UNIQUE REFERENCES expenses(id) ON DELETE CASCADE,
    reason        TEXT NOT NULL,
    status        review_status NOT NULL DEFAULT 'pending',
    assigned_to   UUID REFERENCES users(id),
    decided_by    UUID REFERENCES users(id),
    decided_at    TIMESTAMPTZ,
    decision_note TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- caches & profiles ----------
CREATE TABLE IF NOT EXISTS gstin_lookup_cache (
    gstin        CHAR(15) PRIMARY KEY,
    legal_name   TEXT,
    status       TEXT,
    payload      JSONB,
    cached_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ttl_seconds  INT NOT NULL DEFAULT 86400
);

CREATE TABLE IF NOT EXISTS duplicate_hashes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expense_id  UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    phash       CHAR(16) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anomaly_profiles (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    sample_count    INT NOT NULL DEFAULT 0,
    mean_amount     NUMERIC(18,4) NOT NULL DEFAULT 0,
    stddev_amount   NUMERIC(18,4) NOT NULL DEFAULT 0,
    last_amount     NUMERIC(18,4),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS external_integration_status (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL UNIQUE,                -- 'openai'|'gstin'
    health        integration_health NOT NULL DEFAULT 'unknown',
    circuit_state circuit_state NOT NULL DEFAULT 'closed',
    last_checked  TIMESTAMPTZ,
    last_error    TEXT,
    consecutive_failures INT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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
-- UC10 audit hash-chain functions.
-- fn_build_audit_payload: canonical JSONB payload used for hashing. Both the
-- insert path and the verify path build the payload via this helper so the
-- input to SHA-256 is byte-identical across the two paths. Numeric columns
-- are cast to NUMERIC(5,4) to match the column's stored precision; NULLs are
-- stripped before canonicalization.

CREATE OR REPLACE FUNCTION fn_build_audit_payload(
    p_ts              TIMESTAMPTZ,
    p_user_id         UUID,
    p_expense_id      UUID,
    p_module          TEXT,
    p_model_version   TEXT,
    p_prompt_version  TEXT,
    p_input_ref       TEXT,
    p_output_snapshot JSONB,
    p_confidence      NUMERIC
) RETURNS JSONB
LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_strip_nulls(jsonb_build_object(
        'ts',              to_char(p_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'user_id',         p_user_id,
        'expense_id',      p_expense_id,
        'module',          p_module,
        'model_version',   p_model_version,
        'prompt_version',  p_prompt_version,
        'input_ref',       p_input_ref,
        'output_snapshot', p_output_snapshot,
        'confidence',      p_confidence::NUMERIC(5,4)
    ));
$$;

-- fn_calculate_audit_hash: deterministic SHA-256 of
--     prev_hash || canonical JSON text of the entry payload.
CREATE OR REPLACE FUNCTION fn_calculate_audit_hash(
    p_prev_hash CHAR(64),
    p_payload   JSONB
) RETURNS CHAR(64)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_hex TEXT;
BEGIN
    IF p_prev_hash IS NULL OR length(p_prev_hash) <> 64 THEN
        RAISE EXCEPTION 'prev_hash must be exactly 64 hex characters';
    END IF;
    v_hex := encode(digest(p_prev_hash || p_payload::text, 'sha256'), 'hex');
    RETURN v_hex::CHAR(64);
END;
$$;

-- fn_verify_audit_chain: replays the chain in seq order and returns every row
-- whose stored hash disagrees with the recomputed expected hash. Zero rows
-- returned means the chain is intact.
CREATE OR REPLACE FUNCTION fn_verify_audit_chain()
RETURNS TABLE (
    seq_out       BIGINT,
    expected_hash CHAR(64),
    actual_hash   CHAR(64),
    ok            BOOLEAN
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_prev CHAR(64) := repeat('0', 64);
    v_rec  RECORD;
    v_exp  CHAR(64);
    v_payload JSONB;
BEGIN
    FOR v_rec IN
        SELECT seq, ts, user_id, expense_id, module, model_version, prompt_version,
               input_ref, output_snapshot, confidence, prev_hash, hash
          FROM audit_logs
         ORDER BY seq
    LOOP
        v_payload := fn_build_audit_payload(
            v_rec.ts, v_rec.user_id, v_rec.expense_id, v_rec.module,
            v_rec.model_version, v_rec.prompt_version, v_rec.input_ref,
            v_rec.output_snapshot, v_rec.confidence
        );
        v_exp := fn_calculate_audit_hash(v_prev, v_payload);

        seq_out       := v_rec.seq;
        expected_hash := v_exp;
        actual_hash   := v_rec.hash;
        ok            := (v_exp = v_rec.hash AND v_rec.prev_hash = v_prev);
        IF NOT ok THEN
            RETURN NEXT;
        END IF;
        v_prev := v_rec.hash;
    END LOOP;
    RETURN;
END;
$$;
-- UC10 stored procedures / table functions.
-- Postgres calls anything that returns rows a "function"; we still follow
-- the sp_ naming convention from the brief. Side-effectful procedures use
-- CREATE PROCEDURE (void) where appropriate.

-- ---------- sp_create_expense_submission ----------
-- Atomically inserts a new expense (status=processing) and its receipt file
-- row. Returns the generated expense_id so the caller can queue the AI pipeline.
-- Claim metadata (category, payment_mode, purpose, city, claimed_*,
-- employee_name, department) is stamped onto the row by the repository
-- layer via a follow-up UPDATE — keeping this SP minimal and stable.
CREATE OR REPLACE FUNCTION sp_create_expense_submission(
    p_user_id       UUID,
    p_ref_id        TEXT,
    p_content_type  TEXT,
    p_size_bytes    BIGINT,
    p_storage_path  TEXT,
    p_phash         CHAR(16) DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE v_expense_id UUID;
BEGIN
    INSERT INTO expenses (ref_id, user_id, status)
    VALUES (p_ref_id, p_user_id, 'processing')
    RETURNING id INTO v_expense_id;

    INSERT INTO receipt_files (expense_id, content_type, size_bytes, storage_path, phash)
    VALUES (v_expense_id, p_content_type, p_size_bytes, p_storage_path, p_phash);

    RETURN v_expense_id;
END;
$$;

-- ---------- sp_insert_audit_log_with_hash ----------
-- Runs at SERIALIZABLE isolation to guarantee the hash chain is not interleaved.
-- Payload fields match the jsonb_build_object in fn_verify_audit_chain so
-- recomputed hashes match.
CREATE OR REPLACE FUNCTION sp_insert_audit_log_with_hash(
    p_user_id         UUID,
    p_expense_id      UUID,
    p_module          TEXT,
    p_model_version   TEXT,
    p_prompt_version  TEXT,
    p_input_ref       TEXT,
    p_output_snapshot JSONB,
    p_confidence      NUMERIC
) RETURNS TABLE (
    out_id    UUID,
    out_seq   BIGINT,
    out_hash  CHAR(64)
)
LANGUAGE plpgsql AS $$
DECLARE
    v_prev CHAR(64);
    v_ts   TIMESTAMPTZ := NOW();
    v_payload JSONB;
    v_hash CHAR(64);
    v_id   UUID;
    v_seq  BIGINT;
BEGIN
    -- Take an advisory lock on a dedicated key to serialize chain appends
    -- without blocking other audit writes across the database.
    PERFORM pg_advisory_xact_lock(hashtext('uc10_audit_chain'));

    SELECT COALESCE(
        (SELECT hash FROM audit_logs ORDER BY seq DESC LIMIT 1),
        repeat('0', 64)
    ) INTO v_prev;

    v_payload := fn_build_audit_payload(
        v_ts, p_user_id, p_expense_id, p_module, p_model_version,
        p_prompt_version, p_input_ref, p_output_snapshot, p_confidence
    );
    v_hash := fn_calculate_audit_hash(v_prev, v_payload);

    INSERT INTO audit_logs (
        ts, user_id, expense_id, module, model_version, prompt_version,
        input_ref, output_snapshot, confidence, prev_hash, hash
    ) VALUES (
        v_ts, p_user_id, p_expense_id, p_module, p_model_version, p_prompt_version,
        p_input_ref, p_output_snapshot, p_confidence, v_prev, v_hash
    )
    RETURNING id, seq INTO v_id, v_seq;

    out_id   := v_id;
    out_seq  := v_seq;
    out_hash := v_hash;
    RETURN NEXT;
END;
$$;

-- ---------- sp_get_review_queue ----------
CREATE OR REPLACE FUNCTION sp_get_review_queue(
    p_status review_status DEFAULT NULL,
    p_limit  INT DEFAULT 50,
    p_offset INT DEFAULT 0
) RETURNS TABLE (
    queue_id      UUID,
    expense_id    UUID,
    ref_id        TEXT,
    user_email    TEXT,
    status        review_status,
    reason        TEXT,
    created_at    TIMESTAMPTZ,
    overall_confidence NUMERIC(5,4),
    result        JSONB
)
LANGUAGE sql STABLE AS $$
    SELECT rq.id, rq.expense_id, e.ref_id, u.email, rq.status, rq.reason, rq.created_at,
           e.overall_confidence, e.result
      FROM review_queue rq
      JOIN expenses e ON e.id = rq.expense_id
      JOIN users u    ON u.id = e.user_id
     WHERE p_status IS NULL OR rq.status = p_status
     ORDER BY rq.created_at DESC
     LIMIT p_limit OFFSET p_offset;
$$;

-- ---------- sp_update_threshold ----------
CREATE OR REPLACE FUNCTION sp_update_threshold(
    p_key        TEXT,
    p_value      NUMERIC,
    p_updated_by UUID
) RETURNS NUMERIC
LANGUAGE plpgsql AS $$
DECLARE v_new NUMERIC;
BEGIN
    INSERT INTO thresholds (key, value, updated_by, updated_at)
    VALUES (p_key, p_value, p_updated_by, NOW())
    ON CONFLICT (key) DO UPDATE
        SET value      = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at
    RETURNING value INTO v_new;
    RETURN v_new;
END;
$$;

-- ---------- sp_export_audit_logs ----------
CREATE OR REPLACE FUNCTION sp_export_audit_logs(
    p_from TIMESTAMPTZ,
    p_to   TIMESTAMPTZ
) RETURNS SETOF audit_logs
LANGUAGE sql STABLE AS $$
    SELECT *
      FROM audit_logs
     WHERE ts >= p_from
       AND ts <  p_to
     ORDER BY seq;
$$;
-- UC10 role seed. Matches the Role enum in Domain.

INSERT INTO roles (name, description) VALUES
    ('customer',   'Employee submitting expense receipts'),
    ('analyst',    'Financial analyst handling review queue'),
    ('compliance', 'Compliance officer tuning thresholds and exporting audit logs'),
    ('admin',      'System administrator with full access')
ON CONFLICT (name) DO NOTHING;
-- UC10 default thresholds. Admins can tune at runtime; defaults match FRS.

INSERT INTO thresholds (key, value, description) VALUES
    ('confidence_min',          0.60, 'Overall confidence below this routes to review queue (FR-6.3)'),
    ('duplicate_hamming',       8,    'pHash Hamming distance threshold for duplicate flag (FR-3.5)'),
    ('duplicate_window_days',   90,   'Duplicate-detection lookback window in days (FR-3.4)'),
    ('openai_timeout_ms',       5000, 'Per-call timeout for OpenAI (FR-5.4)'),
    ('gstin_timeout_ms',        3000, 'Per-call timeout for GSTIN lookup (FR-5.4)'),
    ('circuit_fail_threshold',  5,    'Consecutive failures to trip the external-call circuit breaker (FR-5.2)'),
    ('circuit_half_open_secs',  30,   'Seconds to wait before probing a tripped circuit (FR-5.2)'),
    ('policy_amount_cap_inr',   50000,'Default monetary cap for amount_cap rules'),
    ('ocr_weight',              0.30, 'Aggregator weight for OCR module (FR-3.10)'),
    ('duplicate_weight',        0.20, 'Aggregator weight for duplicate module'),
    ('anomaly_weight',          0.20, 'Aggregator weight for anomaly module'),
    ('policy_weight',           0.30, 'Aggregator weight for policy module')
ON CONFLICT (key) DO NOTHING;
-- UC10 default policy rules. Demonstrates each rule type.

INSERT INTO policy_rules (code, name, description, type, params, active, severity) VALUES
    ('amount_cap_default',
     'Expense cap INR 50,000',
     'Individual receipt total must not exceed the configured cap.',
     'amount_cap',
     '{"cap_inr": 50000}'::jsonb,
     TRUE,
     'high'),

    ('require_gstin_high_value',
     'GSTIN required over INR 10,000',
     'Receipts above INR 10,000 must show a valid 15-character GSTIN.',
     'require_gstin',
     '{"min_amount_inr": 10000}'::jsonb,
     TRUE,
     'medium'),

    ('block_entertainment',
     'Block category: entertainment',
     'Entertainment-category expenses are not reimbursable.',
     'category_block',
     '{"blocked_categories": ["entertainment"]}'::jsonb,
     TRUE,
     'medium'),

    ('business_hours_window',
     'Business-hours time window',
     'Receipts dated outside 06:00–23:00 local time are flagged for review.',
     'time_window',
     '{"start_hour": 6, "end_hour": 23, "severity_note": "informational"}'::jsonb,
     TRUE,
     'low'),

    ('fuzzy_vendor_reasonableness',
     'Fuzzy: vendor plausibility',
     'LLM-interpreted rule: vendor and items must plausibly match a business purpose.',
     'fuzzy',
     '{"prompt_hint": "flag receipts whose vendor is unrelated to typical business purposes"}'::jsonb,
     FALSE,
     'low')
ON CONFLICT (code) DO NOTHING;
-- Demo users — DO NOT USE THESE PASSWORDS IN PRODUCTION.
-- Hashes are bcrypt($2b$ cost 10) generated with Python's bcrypt 4.x,
-- compatible with BCrypt.Net-Next on the .NET side. Plaintext passwords
-- are documented inline so the hackathon demo can log in.

--   admin@demo.local      / Admin@123       → admin
--   compliance@demo.local / Compliance@123  → compliance
--   analyst@demo.local    / Analyst@123     → analyst
--   customer@demo.local   / Customer@123    → customer

INSERT INTO users (email, password_hash) VALUES
    ('admin@demo.local',      '$2b$10$kHmBHbpK0lYWYOTU6z3wdOdq6SPQnKDyLCmkFtfuVYaYMTpfBf0Tq'),
    ('compliance@demo.local', '$2b$10$RQXHqqq3Dw6HdZGzBH4pG.HL9BwfDDio2Jtkfp6DORk/BTVwMu.Qi'),
    ('analyst@demo.local',    '$2b$10$9frbcfKqgFF3NqdiQyFI.uPTUXLecQ24W8bawsRleY6siZ84DAKOu'),
    ('customer@demo.local',   '$2b$10$HzsOQjT8J.de7yu6wuepuuBzf30wfYf8JHBpDVhUekIXg/JxecTxS')
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM users u
  JOIN roles r ON (
         (u.email = 'admin@demo.local'      AND r.name = 'admin')
      OR (u.email = 'compliance@demo.local' AND r.name = 'compliance')
      OR (u.email = 'analyst@demo.local'    AND r.name = 'analyst')
      OR (u.email = 'customer@demo.local'   AND r.name = 'customer')
  )
ON CONFLICT DO NOTHING;

-- Seed integration status rows so the admin "Integrations" screen always shows something.
INSERT INTO external_integration_status (name, health) VALUES
    ('openai', 'unknown'),
    ('gstin',  'unknown')
ON CONFLICT (name) DO NOTHING;
-- UC10 migrations. Idempotent ALTERs so re-running psql against an existing
-- volume doesn't error out, and so a fresh `docker compose up` volume picks
-- them up naturally after 00-schema.sql.

-- ---------- enrich users with employee-profile fields ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile               TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_name         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS band                 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_source  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location             TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cost_center          TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_employee_id ON users (employee_id) WHERE employee_id IS NOT NULL;

-- ---------- employee_bands: reference table for band + per-band allowances ----------
-- `allowances` holds per-category caps as JSONB so you can add/remove categories
-- from the admin UI later without a schema migration. Example:
--   { "meals_daily": 2500, "hotel_per_night": 8000, "fuel_per_claim": 3000,
--     "monthly_total": 75000, "entertainment_daily": 1500 }
CREATE TABLE IF NOT EXISTS employee_bands (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    rank_order  INT  NOT NULL DEFAULT 0,      -- for sorting in UI; higher = more senior
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    allowances  JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by  UUID REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_employee_bands_active ON employee_bands (active, rank_order);

-- Optional FK — kept loose so bulk imports can proceed even if a band code is
-- temporarily missing. Enforced by the backend validator instead.
-- ALTER TABLE users ADD CONSTRAINT fk_users_band FOREIGN KEY (band) REFERENCES employee_bands(code);
-- UC10 employee-band seeds. Allowances follow the admin "Band-wise Allowance
-- Configuration" screen's column model so the UI renders them directly:
--   daily_limit           total daily spend cap across all categories (INR)
--   meals_limit           per-day meals cap (INR)
--   hotel_limit           per-night hotel cap (INR)
--   fuel_limit            per-claim fuel cap (INR)
--   mgr_review_threshold  amount above which the claim must go to manager review (INR)
-- Values here are the baseline used by POST /api/admin/employee-bands/reset.

INSERT INTO employee_bands (code, name, description, rank_order, allowances) VALUES
    ('L1', 'Band L1 — Associate',
     'Entry-level individual contributor. Modest daily caps.',
     10,
     '{"daily_limit": 3000, "meals_limit": 800, "hotel_limit": 2500, "fuel_limit": 1200, "mgr_review_threshold": 1500}'::jsonb),

    ('L2', 'Band L2 — Senior Associate',
     'Mid-level individual contributor.',
     20,
     '{"daily_limit": 5000, "meals_limit": 1200, "hotel_limit": 4000, "fuel_limit": 1800, "mgr_review_threshold": 2500}'::jsonb),

    ('L3', 'Band L3 — Lead / Principal',
     'Senior individual contributor or tech lead.',
     30,
     '{"daily_limit": 7000, "meals_limit": 1500, "hotel_limit": 5000, "fuel_limit": 2500, "mgr_review_threshold": 3500}'::jsonb),

    ('M1', 'Band M1 — Manager',
     'First-line manager with a direct team.',
     40,
     '{"daily_limit": 10000, "meals_limit": 2200, "hotel_limit": 7000, "fuel_limit": 3500, "mgr_review_threshold": 5000}'::jsonb),

    ('M2', 'Band M2 — Senior Manager',
     'Second-line manager or functional head.',
     50,
     '{"daily_limit": 15000, "meals_limit": 3000, "hotel_limit": 10000, "fuel_limit": 5000, "mgr_review_threshold": 7000}'::jsonb),

    ('DIR', 'Band DIR — Director / VP',
     'Director-level and above. Highest default caps.',
     60,
     '{"daily_limit": 25000, "meals_limit": 5000, "hotel_limit": 18000, "fuel_limit": 6000, "mgr_review_threshold": 10000}'::jsonb)
ON CONFLICT (code) DO NOTHING;
-- UC10: user-entered claim metadata stored alongside OCR extracts.
-- These fields capture what the employee is *claiming*; OCR results remain in
-- expenses.result (JSONB) as independent verification — the audit can compare.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category     TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_mode TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS purpose      TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS city         TEXT;

CREATE INDEX IF NOT EXISTS ix_expenses_category ON expenses (category);
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
