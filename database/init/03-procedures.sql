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
