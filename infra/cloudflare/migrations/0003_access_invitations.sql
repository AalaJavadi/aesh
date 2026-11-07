-- Explicit invite-by-verified-email onboarding. No legacy passwords migrate.
-- The signed Cloudflare Access JWT supplies the email, never a browser form.
CREATE TABLE IF NOT EXISTS access_invitations (
 email TEXT PRIMARY KEY,
 role TEXT NOT NULL CHECK(role IN ('member','editor')),
 profile_id TEXT REFERENCES profiles(id),
 status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','accepted','revoked')),
 accepted_sub TEXT,
 invited_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_one_profile ON access_invitations(profile_id) WHERE status='invited' AND profile_id IS NOT NULL;
