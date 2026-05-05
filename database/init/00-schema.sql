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
