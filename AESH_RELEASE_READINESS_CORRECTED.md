# SUPERSEDED: READ AESH_REVIEW_READINESS_20261020.md FIRST. THIS HISTORICAL NOTE MAY BE OUTDATED.

# AESH 5.0 — RELEASE READINESS AFTER AUDIT FIX

**STATUS: BLOCKED / NOT READY FOR PRODUCTION.**

| Gate | Status |
|---|---|
| All 33 legacy route slugs reserved | PASS (offline static verification) |
| New member images no longer require Storage upsert SELECT | PASS (code and migration inspection), LIVE NOT TESTED |
| Pending image anonymous access denied | NOT TESTED on real TEST Supabase |
| Admin can view pending image while anon cannot | NOT TESTED |
| Edge only serves approved work after publication and blocks revoked | PASS MOCK, LIVE NOT TESTED |
| One deployed GitHub Pages pipeline & new real pages | PASS fixture; LIVE NOT TESTED |
| Under-100000-byte Storage enforcement | NOT TESTED live |
| 30 Supabase real scenario list | 0 PASS, 30 NOT TESTED |
| Mobile/desktop performance, UI, animations and editor | NOT TESTED with a real browser this turn |
| Sitemap paths and original CSS retention | PASS (offline) |

Deploy the Edge function, then privacy SQL on isolated TEST only, and verify the real HTTP security matrix *before* TEST go/no-go. The Production candidate intentionally has no automatic publishing workflow. Do not run new SQL on the original Supabase or upload the Production ZIP onto aesh.ir.
