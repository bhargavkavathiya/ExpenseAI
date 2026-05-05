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
