-- Immutable source UUID links required for an approved Supabase -> D1 cutover.
-- Data import and approval must be separately verified; migration adds NO rows.
ALTER TABLE works ADD COLUMN legacy_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_works_legacy_id ON works(legacy_id) WHERE legacy_id IS NOT NULL;
