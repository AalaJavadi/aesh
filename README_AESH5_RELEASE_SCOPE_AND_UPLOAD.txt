AESH 5.0 - PUBLIC WEB RELEASE (22 October 2026)
====================================================

IMPORTANT: This is a carefully staged PUBLIC website rollout, NOT a completed
Supabase migration or fully certified AESH 5 backend. As confirmed by the site
owner, the LIVE database currently lacks public.aesh_directory_profiles and
public.aesh_public_directory(). Newly created directory profiles, reviews,
and security-sensitive pending-work uploads will not function fully until a
reviewed TEST-first backend migration and RLS/storage security verification.
Never install SQL automatically; this ZIP performs no database writes.

What's included:
- Full AESH 5.0 website, actual HTML/CSS/JS/images, editor and member UI.
- 60 verified legacy work page files (including aliases); current Cloud pages
  are regenerated from the authoritative published-only Supabase RPC on build.
- Real GitHub Pages Build AND Deploy workflow for AalaJavadi/aesh main.
- Fully tested dynamic Sitemap integrity and orphan-page exclusion.
- Editor source embedding synchronized to this exact release.
- Static public artifact excludes SQL, tools, hidden .github, private files.

DO NOT UPLOAD THE .ZIP FILE AS-IS TO GITHUB CODE.
1) Download ZIP to your PC, extract all files and folders.
2) In GitHub Desktop, open local clone of AalaJavadi/aesh (branch main),
   and make a full local backup first.
3) Copy the extracted CONTENTS into the clone, choose REPLACE when prompted.
   Do not delete old content folders, work pages, Supabase data, or images.
4) Commit to main, Push origin.
5) In GitHub Actions, open "AESH 5.0 - Public site release (Build and Deploy)".
   Both Build and Deploy must succeed. Green checks from "Manual QA" alone
   do not publish anything.
6) Refresh https://aesh.ir/?aesh_version=5 after Deploy succeeds.

If Build fails, do NOT turn off its checks: copy the FIRST red error log and
investigate it. A failed build will not run Deploy.
The previous GitHub Pages release remains available through GitHub Actions
for recovery; do not reset Supabase tables or storage objects.

The current live site cannot be fully certified without access to actual
Supabase auth/RLS/storage, preview Edge gateway and the complete migration
state. Those steps cannot be done by uploading a ZIP. New private-work uploads
fail closed until the server privacy RPC confirms private buckets.
