-- Pending member profile edits; no profile changes without admin approval.
CREATE TABLE IF NOT EXISTS profile_requests (
 id TEXT PRIMARY KEY,
 profile_id TEXT NOT NULL REFERENCES profiles(id),
 actor_sub TEXT NOT NULL REFERENCES actors(sub),
 submitted_json TEXT NOT NULL CHECK(json_valid(submitted_json)),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reason TEXT NOT NULL DEFAULT '',
 reviewed_by TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_requests_one_pending ON profile_requests(profile_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_profile_requests_actor ON profile_requests(actor_sub,created_at);
