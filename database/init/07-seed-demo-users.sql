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
