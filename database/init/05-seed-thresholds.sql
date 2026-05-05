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
