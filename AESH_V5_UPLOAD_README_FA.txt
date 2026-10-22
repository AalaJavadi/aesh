AESH 5.0 | FULL RECOVERY PACKAGE | 2026-10-22

THIS IS A COMPLETE WEBSITE SOURCE PACKAGE, NOT JUST A WORKFLOW .YML.
It was assembled from the last successful Github Actions full public build
(run 431: 171 HTML pages, published work pages included) plus the last reviewed
Production build tools, fixed preview workflow, release-gated production workflow.

CRITICAL: Uploading this ZIP as a single file with GitHub > Add file > Upload
files DOES NOT unzip it and WILL NOT DEPLOY THE WEBSITE. GitHub treats ZIP
as one ordinary file. Do NOT repeat that workflow.

Safest route with GitHub Desktop:
1) Download backup of your current repository and retain it.
2) Clone github.com/AalaJavadi/aesh in GitHub Desktop.
3) Unzip this package; copy the CONTENTS (including hidden .github) into
   the cloned repo folder, choosing replace matching files. Never delete files
   already in the clone, so work uploaded since this snapshot is not erased.
4) In GitHub Desktop review Changes. Commit and Push origin on main ONLY
   after checking the diff, especially CNAME/.github/assets/work directories.
5) Open Actions. The preview workflow should build an artifact (NOT deploy).
   Production is intentionally gated; do NOT set production approval flags
   or bypass privacy checks simply to turn the badge green.

Live database caveat: aesh_public_directory RPC was missing (PGRST202)
in last checked live build. This archive does NOT create SQL functions,
run migrations, relax permissions, or certify Production release readiness.
No live Supabase writes made by this package process.

If the goal is to publish with ONLY uploading ONE ZIP directly to GitHub web,
that is not possible with the currently installed GitHub Pages workflows.
You need the unpacked files committed via GitHub Desktop/Git or a separately
configured ZIP-consuming Action, which is NOT in the current repository.
