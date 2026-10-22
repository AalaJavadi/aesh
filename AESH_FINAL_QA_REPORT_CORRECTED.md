# SUPERSEDED: READ AESH_REVIEW_FIX_QA_20261020.md FIRST. THIS HISTORICAL NOTE MAY BE OUTDATED.

# AESH 5.0 — INDEPENDENT AUDIT CORRECTION QA

Date: 2026-10-20. Based on `AESH_TEST.zip`, `AESH_PRODUCTION.zip` and `AESH_DATABASE_MIGRATIONS.zip` from the prior turn. None of the original files were modified.

**Missing material:** `AESH_INDEPENDENT_AUDIT_20261020.md` was not actually available as an attachment. The four findings in the user message are the test plan; no unseen details are claimed.

| Finding | Result | Evidence / limitations |
|---|---|---|
| ثبت تمام نامک‌های قدیمی | PASS - کد/مسیر | ۳۳ جفت نقش/نامک از تمام HTMLهای قدیمی و registry، شامل ۱۰ مورد افزوده نسبت به ۲۳ مورد قبلی؛ ثبت در SQL و CI gate |
| عکس پروفایل عضو جدید / upsert | PASS - کد؛ NOT TESTED - سرور | نام UUID جدید برای هر فایل، INSERT بدون x-upsert؛ سیاست UPDATE مخصوص این قابلیت حذف شد، نیاز به SELECT رفع شد |
| امنیت Pending | PASS - طراحی و شبیه‌سازی؛ NOT TESTED - سرور | سه Bucket کار باید PRIVATE باشند، READ fence محدودکننده، Edge gate فقط برای اثر منتشرشده؛ تست GET ناشناس و RLS واقعی اجرا نشده |
| روش انتشار GitHub و صفحات | PASS - Fixture؛ NOT TESTED - GitHub | یک Workflow برای ZIP یا پوشه استخراج‌شده، تشخیص Workflow متداخل، تولید و پس‌گرفتن HTML استاد/هنرجو/اثر با Fixture |

## Verified OFFLINE results

- 33 distinct legacy (role, slug) pairs reserved in SQL (19 teachers, 14 students); 29 sitemap legacy profile pairs all covered. The 23 entries in the prior SQL were a subset.
- 11/11 TEST static assertions passed, plus single-deployer check (12/12); 8/8 checks for the unmodified-metadata Production candidate passed.
- 26 JavaScript files passed `node --check`; 10 Python files passed parse compilation. GitHub Workflow passed YAML parsing. Edge TypeScript passed `tsc --noEmit` using a minimal local Deno-global type stub.
- Offline generator created one new teacher, student, and work HTML. After removing fixture data, generated files were removed and the pre-existing profile remained byte-identical. TEST noindex metadata was reapplied.
- Mock Edge requests: PENDING 404, approved 200, revoked 404, RPC failure 503, malformed path 404, invalid method 405. **Mocks do not demonstrate actual RLS or bucket confidentiality.**
- ZIP CRC / extraction, sitemap parity and source hash differences are checked separately in the archive verification output.

## Unverified BLOCKERS

- 0 of 30 live Supabase workflows tested. No independent test project, test owner/teacher/student, test Storage bucket inventory or server HTTP logs available.
- Real GitHub Actions for the user's existing ZIP-extracting repository are inaccessible: existing workflow must first be removed/disabled to avoid a conflicting publisher. The new workflow detects conflicts and aborts.
- Existing legacy RLS and `aesh_public_works()` definitions are missing from provided artifacts; SQL 004 is a candidate to review and execute on TEST only.
- No real mobile/browser visual screenshot or PageSpeed measurement. Image proxy makes speed regression testing particularly important.
- Auto-compression under 100000 bytes was preserved in site code, but uploaded image bytes were NOT measured in TEST Storage.

**Release verdict: NOT READY.** Neither ZIP is approved for publication to `aesh.ir`.
