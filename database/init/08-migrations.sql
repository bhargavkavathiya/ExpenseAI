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
