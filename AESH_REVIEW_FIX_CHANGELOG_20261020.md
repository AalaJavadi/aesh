# AESH 5.0 — Supplemental code change log (2026-10-20)

## TEST + PRODUCTION source (same changes)

- `tools/stage_site.py`: include `editor/` and `directory-profile/` when copying to `_site`, and fail immediately on mandatory post-stage check failure.
- `tools/verify_staged_site.py` [NEW]: validate every essential page, public assets, legacy/Unicode sitemap routes, generated routes, editor, member panel, private source exclusions, and Cloud authoritative-sync state.
- `tools/sync_cloud_share.py`: inspect archived Cloud detail HTML by validated body UUID (not only state JSON), preserve published items/legacy works, abort on invalid RPC/slug collisions, update percent-encoded sitemap, Cloud cards and search index after successful snapshots only.
- `tools/test_staged_and_archive_offline.py` [NEW]: isolated offline reproduction of 15 untracked archived works, 60 static works, malformed/network response, retention/deletion, sitemap parity, newly generated page staging, and mandatory failure on missing pages.
- `tools/check_editor_fallback_offline.py` [NEW]: compare manifest/internal fallback embedded bytes and reject stale CI/SQL/release scripts.
- `assets/aesh-package-files.json`: add all nonpublic build dependencies so a subsequent editor-generated ZIP remains complete.
- `assets/aesh-editor-immutable.js` and `editor/index.html`: replace outdated embedded CI and Cloud script bytes with current TEST/PRODUCTION-specific source copies. The editor's normal design/CSS was not changed.

## Only TEST source

- `.github/workflows/aesh-cloud-previews.yml`: run new regression suite and editor fallback consistency check before any live synchronization; assert staged routes after Stage. Existing exclusive-deployer gate retained.

## Only PRODUCTION source

- `.github/workflows/aesh-production-pages.yml` [NEW]: optional periodic generator and publisher, **disabled by default** and gated by explicit release/repository variables plus a read-only private bucket verification. No GitHub action or Production publication has been performed.
- `tools/check_production_release.py` [NEW]: require correct CNAME, non-TEST bundle and one publisher in a future activated Production repo.
- `tools/check_production_privacy_readonly.py` [NEW]: check boolean private-bucket state through explicitly approved project RPC. This cannot establish pending-image RLS on its own.

## Unmodified and preserved

- Main site layout, fonts, styles, images, original teacher/student/legacy-work HTML, old URL mapping, animation files, image compression, Supabase member forms and Edge Function logic.
- Existing SQL migration contents and privacy controls; no SQL was executed.

## Evidence

`AESH_REVIEW_FIX_QA_20261020.md` and `AESH_REVIEW_TEST_LOG_20261020.txt` contain the offline reproduction and the untested live gates.
