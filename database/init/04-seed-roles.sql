-- UC10 role seed. Matches the Role enum in Domain.

INSERT INTO roles (name, description) VALUES
    ('customer',   'Employee submitting expense receipts'),
    ('analyst',    'Financial analyst handling review queue'),
    ('compliance', 'Compliance officer tuning thresholds and exporting audit logs'),
    ('admin',      'System administrator with full access')
ON CONFLICT (name) DO NOTHING;
