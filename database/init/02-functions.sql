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
