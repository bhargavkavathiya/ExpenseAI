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
