# AESH — فعال‌سازی ایمن زیرساخت Cloudflare (فقط محیط آزمایشی)

**وضعیت واقعی در زمان تحویل:** کد آماده و ۷۰ آزمون API آفلاین PASS است؛ هنوز **D1/R2/Access/Worker واقعی این حساب راه‌اندازی، تست یا به Supabase Production متصل نشده‌اند**. از هیچ توکن یا مجوز کارفرما استفاده نشده و DNS `aesh.ir` تغییر نکرده است.

## ساختار موجود

- `src/worker.js`: API با تأیید امضای RSA توکن Cloudflare Access، نقش‌های مدیر/ویرایشگر/عضو، R2 خصوصی، D1 و ثبت تاریخچه. فقط `published` در Snapshot و تصویر عمومی قابل مشاهده است.
- `migrations/0001` تا `0004`: چهار مهاجرت یکتا (SQLite/D1)، شامل شناسه‌های قدیمی، دعوت امن، درخواست ویرایش پروفایل. **برای Production خودکار اعمال نمی‌شوند.**
- `public/control/`: پنل فارسی مدیریت پروفایل‌ها، نمودار ۰ تا ۱۰۰، آثار، مقالات، حساب‌ها، دعوت، تأیید آثار و تاریخچه.
- `public/member/`: پنل عضو فارسی؛ اطلاعات حساب، آمار آثار، تصویر، درخواست ویرایش پروفایل، پیش‌نویس و ارسال اثر و دلیل رد.
- `scripts/provision-preview.mjs`: ساخت منابع **preview با نام مشخص** بدون DNS و بدون نوشتن روی Supabase؛ دارای self-test.
- `scripts/smoke-preview.mjs`: آزمون شبکه‌ای فقط‌خواندنی Worker استقرار‌یافته (health، Snapshot بدون توکن، دسترسی عضو/مدیر ناشناس و عکس تأییدنشده). برای زمان استقرار آماده است، **هنوز اجرا نشده**.
- `.github/workflows/aesh-cloudflare-staging.yml`: اجرا فقط روی شاخه `aesh-rescue-test` و با Variable `AESH_STAGING_ENABLED=yes`. ساخت D1/R2 و Worker preview و تست سلامت؛ **هیچ انتشار GitHub Pages یا تغییر DNS ندارد**.

## مراحل فعال‌سازی توسط مالک (بدون SQL/Python)

۱. یک Branch در GitHub Desktop با نام `aesh-rescue-test` بسازید و ZIP را روی همان Branch Push کنید. هیچ‌چیز را روی `main` تغییر ندهید.

۲. در Cloudflare، R2 را فعال کنید؛ ممکن است تأیید حساب/صورتحساب لازم باشد. زیر Zero Trust یک **Self-hosted Access application** برای آدرس آزمایشی `aesh-cms-preview.<account-subdomain>.workers.dev` ایجاد کنید که فقط مسیرهای `/control`, `/control/*`, `/member`, `/member/*` را محافظت می‌کند. برای یک Audience واحد، این مسیرها باید متعلق به **همان Application** باشند و ورود فقط برای ایمیل‌های مجاز و قابل‌تأیید انجام شود. زیر Advanced → Cookie Settings، **Cookie Path Attribute را خاموش** کنید؛ در غیر این صورت `/v1/me` و API پس از ورود ممکن است کوکی را دریافت نکنند.

**نکته حیاتی:** «Protect whole Worker» را برای این معماری انتخاب نکنید. اگر کل Worker پشت Access برود، `/v1/public/media/:id` و `/v1/public/snapshot` از GitHub Actions قابل خواندن نیستند. مسیرهای API خصوصی را خود Worker با امضای JWT و نقش سمت سرور محافظت می‌کند؛ Endpoint عمومی Snapshot هم به توکن محرمانه ۳۲+ کاراکتری نیاز دارد. **این تنظیم مسیرها باید روی حساب واقعی تأیید شود، نه صرفاً فرض شود.**

۳. در GitHub: `Settings → Secrets and variables → Actions` چهار Secret را به شکل زیر بگذارید:

   - `AESH_CLOUDFLARE_ACCOUNT_ID`: Account ID حساب Cloudflare
   - `AESH_CLOUDFLARE_API_TOKEN`: توکن محدود به همان حساب با دسترسی Workers Scripts، D1 و R2
   - `AESH_BOOTSTRAP_ADMIN_EMAIL`: ایمیل تأییدشده مدیر در برنامه Access
   - `AESH_CMS_PUBLISH_TOKEN`: رمز تصادفی طولانی (حداقل ۳۲ کاراکتر)، کاملاً محرمانه

   دو **Variable** نیز لازم است: `AESH_ACCESS_TEAM` (مانند `team.cloudflareaccess.com`) و `AESH_ACCESS_AUD` (Audience همان App). Token، دیتابیس dump، رمز عبور یا فایل Storage را **هرگز داخل چت، مخزن عمومی یا ZIP قرار ندهید**.

۴. فقط پس از بررسی پیکربندی Access و با انتخاب Branch آزمایشی، Variable `AESH_STAGING_ENABLED=yes` را اضافه کنید. یک Commit/Push جدید روی همان Branch، اجرای `AESH - Provision and test Cloudflare STAGING only` را فعال می‌کند. Workflow باید PASS شود. یک D1 و یک R2 خصوصی preview ایجاد می‌شود، چهار Migration اعمال می‌شوند و Worker فقط روی `workers.dev` مستقر خواهد شد. **در صورت FAIL، سیستم قابل استفاده اعلام نمی‌شود**.

۵. با حساب‌های آزمایشی به `/control/` و `/member/` پیش‌نمایش بروید، ورود/خروج، نقش‌ها، ایجاد و تأیید استاد/هنرجو، مقاله، تصاویر خصوصی و عمومی و صف آثار را در مرورگر واقعی بسنجید. گزارش دستی آن را نگه دارید. **هیچ داده واقعی به Preview نریزید تا طرح مهاجرت، بکاپ و Restore تأیید شده باشد.**

## انتقال ایمن و انتشار محتوا

- بکاپ دیتابیس و Storage از Supabase جداست: ابزار دوبارکلیک رایگان در `backup/` آماده شده اما بدون اتصال حساب/تست Restore، انتقال آغاز نمی‌شود.
- برای اعضای قدیمی، **رمز عبور کپی نمی‌شود**؛ با تطبیق شناسه و ایمیل معتبر، دعوت امن/Cloudflare Access فعال می‌شود. به هر پروفایل حداکثر یک حساب قابل اتصال است.
- CMS مقاله را به شکل `draft` و `published` در D1 نگه می‌دارد؛ مقاله منتشرشده تنها پس از Build/Deploy موفق به HTML واقعی GitHub Pages تبدیل می‌شود. درخواست Dispatch از پنل، **عمداً پیش‌فرض خاموش** است (`ENABLE_PUBLISH_DISPATCH=false`) و به مجوز و توکن محدود GitHub نیاز دارد. پاسخ «درخواست در صف» به معنای انتشار موفق نیست.
- روی `main` Workflow `aesh-production-pages.yml` **فعلاً** از Supabase RPC برای آثار قدیمی استفاده می‌کند. این وابستگی را کورکورانه حذف نکنید.
- مسیر جایگزینی تأییدشده در `tools/sync_cms_cutover.py` با `AESH_PUBLIC_SOURCE=cloudflare-verified`, `AESH_CMS_SNAPSHOT_URL`, `AESH_CMS_PUBLISH_TOKEN`, `AESH_CLOUD_CUTOVER_APPROVAL` وجود دارد؛ فقط پس از Restore آزمایشی بکاپ و نگاشت **تمام UUIDهای آثار قدیمی** با امضای مالک فعال می‌شود. در کمبود حتی یک نگاشت، Build خطا می‌دهد و نسخه سالم قبلی منتشر می‌ماند. تمامی URLها و محتوای Legacy غیرقابل تطبیق حفظ می‌شوند.

## شواهد، آزمون‌ها و مراجع

آزمون API آفلاین: `tools/test_cloudflare_cms.mjs` — امضای JWT، نقش‌ها، نگاشت Legacy، دعوت، R2 خصوصی، مالکیت آثار، مدیریت و Snapshot. مهاجرت تکراری `0004` حذف و تست یکتا بودن نسخه‌های D1 افزوده شده است.

آزمون Build استاتیک: `tools/test_cms_static_offline.py`؛ آزمون Cutover: `tools/test_cloud_cutover_offline.py`. برای مالک اجرای هیچ‌کدام لازم نیست. نتیجه هرکدام در `FINAL_TEST_REPORT.md` آمده است.

راهنمای رسمی Cloudflare: https://developers.cloudflare.com/workers/configuration/cloudflare-access/ و https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/ و https://developers.cloudflare.com/workers/wrangler/commands/d1/ .
