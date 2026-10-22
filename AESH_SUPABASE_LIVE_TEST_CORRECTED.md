# SUPERSEDED: READ AESH_SUPABASE_LIVE_TEST_REVIEW_20261020.md FIRST. THIS HISTORICAL NOTE MAY BE OUTDATED.

# AESH 5.0 — REAL SUPABASE TEST STATUS (2026-10-20)

**LIVE RESULT: 0/30 PASS; 30/30 NOT TESTED. Production release is BLOCKED.**

No separate Supabase TEST project URL, publishable key, role-based TEST logins,
HTTP trace or existing legacy schema has been supplied. No remote database was
contacted and no SQL was executed. All previous Fixture or mocked Edge tests
are documented as OFFLINE, not as Supabase live results.

The quoted independent audit filename was not present in the current conversation
files; these changes respond to the four findings in the user's own message.

| # | Mandatory live scenario | Status | Evidence |
|---|---|---|---|
| 1 | ورود استاد با حساب آزمایشی واقعی | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 2 | ورود هنرجو با حساب آزمایشی واقعی | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 3 | ورود مدیر مجاز | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 4 | خروج و ورود مجدد | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 5 | دریافت پروفایل واقعی از Supabase | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 6 | ایجاد استاد توسط مدیر | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 7 | ایجاد هنرجو توسط مدیر | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 8 | ویرایش رکورد پروفایل | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 9 | ساخت و نمایش URL مستقل پروفایل جدید | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 10 | آپلود نمونه‌کار از پنل عضو | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 11 | نمایش عکس اصلی در صف تأیید مدیر | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 12 | تأیید و انتشار اثر | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 13 | نمایش اثر تازه در ابتدای گالری | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 14 | نمایش اثر در پروفایل مالک | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 15 | هشت اثر آخر استاد پس از انتشار | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 16 | نمایش ابعاد واقعی | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 17 | ثبت لایک و دیسلایک با UUID/کلید پایدار | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 18 | لغو انتشار اثر و حذف عمومی | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 19 | ثبت نظر درباره انجمن با کاربر عمومی | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 20 | ذخیره اولیه pending | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 21 | تأیید نظر توسط مدیر | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 22 | نمایش فقط approved | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 23 | رد و پنهان‌سازی نظر | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 24 | عدم مجوز تأیید نظر برای غیرمدیر | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 25 | عدم مجوز ایجاد عضو برای غیرمدیر | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 26 | عدم دسترسی عمومی به تصویر اثر pending | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 27 | Refresh / Back / Forward | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 28 | باز شدن لینک مستقیم اثر جدید | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 29 | دریافت داده جدید پس از بازگشت به تب | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |
| 30 | عدم تولید کارت تکراری و حفظ آثار پیشین | **NOT TESTED** | No actual TEST project HTTP/Auth/RLS/UI evidence |

## Extra security release gates (ALL NOT TESTED online)

1. Verify `storage.buckets.public=false` for `aesh-member-works`, `aesh-owner-works`, `aesh-work-thumbs` on an **isolated TEST project**; direct unauthenticated `object/public`, anonymous `object/authenticated` and `aesh-approved-media` requests to a REAL pending object must return HTTP 401, 403 or 404. HTTP 200 is FAIL.
2. A legitimate test manager must fetch the same pending work with a short-lived authenticated request and receive HTTP 200. A normal student and an anonymous visitor must not.
3. Approve work -> HTTPS gateway 200; revoke publication -> gateway 404. Check an old existing published work still displays correctly.
4. Owner image uploads use a new UUID INSERT (not upsert). Verify real POST and RLS allow authorized owner; unauthenticated/non-owner requests fail.
5. Exactly 100000-byte WebP upload must fail at Storage; 500KB, 2MB, 5MB, 10MB originals must yield stored bytes <=99999 after client optimization. Verify actual Storage metadata, not preview only.
6. Verify 001/001b/002/004 migrations against actual TEST legacy definitions, especially existing `aesh_public_works()` and `aesh_my_profile()`.
7. Verify published HTML for a new teacher, student and work through a real GitHub Actions run in the isolated test repository; check it has exactly ONE active deployer.
8. Benchmark real LCP/CLS/INP and image gateway latency on mobile+desktop; Edge proxy adds an HTTP hop, so unchanged speed cannot be asserted.

**No passwords, JWT, production keys, or service_role keys should be sent in chat or stored in these ZIPs.**
