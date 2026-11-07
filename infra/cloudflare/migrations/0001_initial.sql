-- AESH Cloudflare D1 schema v1. Applies only to a NEW D1 database, not Supabase.
-- D1 is SQLite; these are intentionally not PostgreSQL or Supabase RPCs.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS actors (
 sub TEXT PRIMARY KEY,
 email TEXT NOT NULL DEFAULT '',
 role TEXT NOT NULL CHECK(role IN ('admin','editor','member')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS profiles (
 id TEXT PRIMARY KEY,
 legacy_id TEXT UNIQUE,
 role TEXT NOT NULL CHECK(role IN ('teacher','student')),
 slug TEXT NOT NULL,
 display_name TEXT NOT NULL,
 specialty TEXT NOT NULL DEFAULT '',
 bio TEXT NOT NULL DEFAULT '',
 skills_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(skills_json)),
 extra_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(extra_json)),
 stats_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(stats_json)),
 performance_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(performance_json)),
 media_id TEXT,
 actor_sub TEXT REFERENCES actors(sub) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(role,slug)
);
CREATE TABLE IF NOT EXISTS media (
 id TEXT PRIMARY KEY,
 object_key TEXT NOT NULL UNIQUE,
 content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
 bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=2097152),
 owner_sub TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS works (
 id TEXT PRIMARY KEY,
 profile_id TEXT NOT NULL REFERENCES profiles(id),
 actor_sub TEXT REFERENCES actors(sub) ON DELETE SET NULL,
 slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 media_id TEXT NOT NULL REFERENCES media(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','archived')),
 rejection_reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 published_at TEXT,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS articles (
 id TEXT PRIMARY KEY,
 slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 excerpt TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL DEFAULT 'آموزش',
 tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json)),
 blocks_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(blocks_json)),
 author TEXT NOT NULL DEFAULT 'انجمن ادیتوران شایسته',
 seo_title TEXT NOT NULL DEFAULT '',
 seo_description TEXT NOT NULL DEFAULT '',
 media_id TEXT REFERENCES media(id),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 published_at TEXT,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Visibility is never inferred from storage prefixes: every public object
-- must be referenced by a currently published row. No public R2 bucket required.
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status,updated_at);
CREATE INDEX IF NOT EXISTS idx_profiles_actor ON profiles(actor_sub);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status,published_at);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status,published_at);
CREATE INDEX IF NOT EXISTS idx_works_actor ON works(actor_sub);
CREATE TABLE IF NOT EXISTS audit_log (
 id TEXT PRIMARY KEY,
 actor_sub TEXT NOT NULL,
 action TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
