# AESH 5.0 — AUDIT CORRECTION CHANGELOG (2026-10-20)

- **Never touched:** public site, production Supabase, original source archive, prior ZIPs, original CSS/animation/font/image binaries and canonical URLs.
- `sql/aesh5/001b_reserved_slugs.sql`: regenerated full 33 role/slug reservations from legacy URLs plus owner registry.
- `assets/aesh-core.js`: insert-only immutable UUID for newly uploaded directory photos; `aesh_5_work_buckets_private` fail-closed preflight for work uploads; public approved work media directed to the controlled Edge gateway.
- `sql/aesh5/002_storage_limits.sql`: no new directory UPDATE/SELECT policies; drops only the previous named AESH5 directory UPDATE policy, preserving others.
- `sql/aesh5/004_private_work_media.sql` (NEW): private work buckets, restrictive read policy for anon/auth, manager-authenticated preview SELECT, read-only privacy preflight, published-media authorization RPC.
- `supabase/functions/aesh-approved-media/index.ts` and `supabase/config.toml` (NEW): server-side published-only image gateway, no exposed service-role secrets. Requires separate Edge deployment on TEST; source is not a substitute for tests.
- Existing Cloud-specific HTML and `tools/aesh5-source.html`: replace public work URLs with the published-only gateway without altering design or typography.
- `tools/sync_cloud_share.py`: new work and OG artwork previews use protected image gateway; fixture generation no longer requires preconfigured live Supabase credentials.
- `tools/sync_directory_profiles.py`: allow each new directory photo path to have independent UUID; explicit unpublished fixture defense; FAIL instead of false-success if live directory RPC fetch breaks.
- `.github/workflows/aesh-cloud-previews.yml` (TEST ONLY): single Pages deployment workflow; supports ZIP or extracted source, fails on competing deploy workflow, validates TEST Supabase identity and private bucket state, runs generators and exports staged site only.
- `tools/check_aesh_release.py`, `tools/test_generated_pages_offline.py`, `tools/configure_isolated_test.py`, `tools/verify_pending_security.py` (NEW): offline regression checks, isolated config and real read-only privacy HTTP probe.
- Production ZIP: NO active GitHub Pages workflow; unchanged CNAME and original production SEO; DO_NOT_DEPLOY_YET flag.
- `sql/aesh5/003_verify_read_only.sql`, `ROLLBACK_GUIDE.md`, reports and installation guide: updated instructions / evidence and release blockers.
