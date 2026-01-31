-- Seed data for ipn.fyi Dynamic DNS Service
-- Default API keys for initial setup

-- Insert default API keys
INSERT INTO api_keys (afterdark_login, api_key, is_admin, is_active)
VALUES
    -- dsc.n.ipn.fyi key
    ('dsc', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2', false, true),

    -- rams.n.ipn.fyi key
    ('rams', 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3', false, true),

    -- david.n.ipn.fyi key
    ('david', 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4', false, true),

    -- admin key (can create any subdomain)
    ('admin', 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5', true, true)
ON CONFLICT (afterdark_login) DO NOTHING;

-- Display the created keys
SELECT
    afterdark_login,
    api_key,
    is_admin,
    created_at
FROM api_keys
WHERE afterdark_login IN ('dsc', 'rams', 'david', 'admin')
ORDER BY
    CASE
        WHEN afterdark_login = 'admin' THEN 0
        ELSE 1
    END,
    afterdark_login;
