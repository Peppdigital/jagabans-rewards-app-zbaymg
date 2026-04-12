-- Seed default app_config key-value rows.
-- The table already exists with schema: key text PK, value text, updated_at timestamptz

INSERT INTO app_config (key, value)
VALUES
  ('hours_restriction_enabled', 'true'),
  ('store_manually_closed', 'false')
ON CONFLICT (key) DO NOTHING;
