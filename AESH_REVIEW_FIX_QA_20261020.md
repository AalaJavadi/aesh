# AESH 5.0 — Supplemental Independent Review Fix / QA (2026-10-20)

## Scope and evidence

The named `AESH_INDEPENDENT_REVIEW_CORRECTED_20261020.md` was NOT supplied or found in the available files. This implementation uses the two reproduced defects and extra review questions described explicitly in the user's message, checked against the provided `AESH_TEST_CORRECTED_20261020.zip`, `AESH_PRODUCTION_CORRECTED_20261020.zip`, and prior migrations.

**Release decision: BLOCKED / NOT READY.** No contact was made with Production Supabase or aesh.ir; no SQL was executed or GitHub files published. No live TEST Supabase credentials, a test repository or authenticated browser session were available. Offline PASS is NOT a live deployment PASS.

## Finding 1 — required GitHub Pages staging directories

Root cause: `tools/stage_site.py` copied main sections but not `editor/` or `directory-profile/`. Consequently `_site/editor/index.html` and `_site/directory-profile/index.html` were absent even when they existed in the source ZIP.

Changes:

- Add `editor/` and `directory-profile/` to `SECTIONS` in both TEST and PRODUCTION.
- Add `tools/verify_staged_site.py` as a mandatory, fail-closed build check. Require editor, fallback profile, members, studio, public section pages, static JS/CSS, favicon/robots/sitemap, all existing teacher/student/work/course/featured HTML, and every decoded sitemap URL. Fail with nonzero exit if ANY required route is missing.
- Require a successful Cloud RPC reconciliation state before staging, including no stale work HTML that is absent from that state. Never stage untracked legacy Cloud pages directly from the raw ZIP.
- Invoke this check inside `stage_site.py` AND as a separate GitHub Actions post-stage step. The existing TEST workflow still fails if conflicting Pages deploy workflows exist in the test repository.
- Offline failures explicitly reproduced by deleting a staged editor, directory-profile, members, new work route and critical editor JS asset, and by deleting the source editor page before Stage. Every case generated a nonzero result.

**Result: PASS (offline fixture and filesystem).** **NOT TESTED (real GitHub Pages Actions, browser Ctrl+Shift+E, login and fallback network).**

## Finding 2 — 15 prepackaged, untracked Cloud pages

Root cause: `tools/sync_cloud_share.py` only removed paths recorded in `.aesh-generated-share-pages.json`. The corrected ZIP actually contains **15 Cloud HTML pages with valid `data-aesh-work-id="cloud:UUID"` values**, while that generated state file is absent. There are also **60 legacy/static work detail pages**.

Fix:

- Scan only `work/*/index.html`, verify a complete Cloud UUID from the actual work page BODY, and reconcile both discovered historic pages and state-tracked generated pages against a valid, successfully returned `aesh_public_works` list.
- Treat a network failure, non-list RPC response, invalid row, duplicate UUID, duplicate slug or collision with a static page as a hard failure BEFORE deleting files. Never delete based only on slug/title or on a stale state record.
- Delete Cloud detail HTML only when its validated UUID is no longer represented by the successful published snapshot (including old URLs of an ID whose published slug changes). Never touch legacy/static detail pages.
- Remove corresponding percent-encoded sitemap URLs using normalized URL paths, and remove stale Cloud-only cards and search-index results, without changing legacy/static cards or published Cloud items.
- Keep `/404.html` and the approved-only Cloud fallback untouched. Note that static GitHub Pages can display an OLD already-deployed HTML shell until the next successful scheduled redeployment; the Edge media gate must independently deny unpublished images immediately.

### Exact offline reproduction

| Offline scenario | Measured result | Status |
|---|---|---|
| Baseline raw ZIP | 15 historical Cloud pages untracked; 60 legacy/static works; 89 sitemap URLs | Confirmed |
| RPC error / invalid published row | Pre-existing HTML, portfolio HTML and sitemap checksums unchanged | PASS offline |
| Published RPC containing 1 of the 15 existing UUIDs | 14 stale old Cloud pages deleted; 1 kept and refreshed; 60 static pages identical | PASS offline |
| Add a new published fixture UUID | New independent work HTML generated and staged | PASS offline |
| A published UUID collides with an old static page URL | Build failed; old page checksum unchanged | PASS offline |
| Successful empty published RPC | All 15 prepackaged Cloud HTML pages absent; 60 legacy works intact; 89->74 sitemap entries | PASS offline |
| Revoked Cloud cards and search references | Removed after successful snapshot; no change on RPC failure | PASS offline |
| Re-run same empty published snapshot | No extra deletion / idempotent | PASS offline |
| Missing staged editor, directory fallback, members, JS or new work page | Nonzero build validation error on EVERY test | PASS offline |
| Clean TEST and Production variants | Offline generator/stager checks pass in temp copies | PASS offline |

The regression suite is available as `tools/test_staged_and_archive_offline.py`. It uses fixtures and test-only temporary copies; it DOES NOT write to Supabase, GitHub or the production site.

## Additional reviews

**TEST archival media:** All 15 raw TEST Cloud detail files referenced the placeholder host `aesh-test.invalid`. They cannot be considered working images in an unconfigured TEST ZIP. The fail-closed staging gate refuses publishing raw Cloud archive pages before a successful isolated TEST RPC refresh. Generated pages use the actual configured TEST Supabase host, and already-approved media is served via `aesh-approved-media`. The deployed Edge Function, real image HTTP bytes, signed access, and archived object availability are **NOT TESTED**.

**PRODUCTION generation:** A separately named Production GitHub Pages generation workflow is included. It is **disabled by default**: both explicit `AESH_PRODUCTION_RELEASE_APPROVED=true` and an exact `AESH_PRODUCTION_REPOSITORY` match (plus main branch) are required for the job to run. The workflow also makes a read-only private-bucket RPC check against the expected `AESH_PRODUCTION_SUPABASE_REF`, and fails closed on any error. It is *not* deployed, activated or live-tested. No production SQL is run by this workflow.

**Pending security:** The 001/001b/002/004 SQL migrations, RLS/storage design and `aesh-approved-media` Edge Function were copied unchanged from the prior corrected package. Their presence is verifiable; their actual private-bucket enforcement, anonymous HTTP denial, authenticated manager preview and approved/revoked Edge results remain **NOT TESTED live**. An image can be publicly displayed only if the proper migration and Edge Function have actually been deployed and validated.

**Editor ZIP regression:** The source manifest and BOTH editor ZIP fallbacks were updated to embed the latest Cloud sync, Stage, new route gate, safety tests, approved-media function, SQL and the appropriate single TEST or approval-gated Production workflow. Offline byte-comparison passed for 43 non-public files in TEST and 44 in PRODUCTION, including source docs and required tools. Browser-triggered Ctrl+Shift+E, password login, full ZIP export and a round-trip GitHub Pages deploy are **NOT TESTED**.

**Preservation:** All 308 existing image files and 11 CSS files were byte-identical to the previous packages, including previous uploads. Compression code under 100000 bytes remains intact; actual Storage byte tests and any real visual/speed/animation benchmark remain **NOT TESTED**. Reconciliation removes HTML/index references after successful database snapshots; it never deletes Storage objects or database records.

## Source checks / installation blocks

- TEST, Production: each had Python module syntax, JavaScript `node --check` and GitHub Workflow YAML validated offline.
- The original 89 sitemap URL entries remain in both *source* ZIPs until an authoritative successful Cloud refresh; no presumed revoked work is deleted in advance.
- The mandatory 30 live Supabase scenarios are still **0/30 PASS; 30/30 NOT TESTED**. See `AESH_SUPABASE_LIVE_TEST_REVIEW_20261020.md`.
- Actual GitHub Actions execution, isolated Supabase Auth, Storage RLS, live Edge function, UI/mobile/browser, real image byte limits and Core Web Vitals are NOT TESTED.

**Do not deploy Production or apply SQL to Production.** Complete the isolated TEST setup, 30 real scenarios and approved-media privacy checks with real HTTP evidence first.
