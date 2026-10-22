-- AESH 5.0 / 001b — COMPLETE RESERVATION OF STATIC PROFILE ROUTES.
-- Regenerated from ALL legacy teacher/student HTML routes (including #U encoded
-- aliases) and assets/aesh-work-owners.json, NOT a hand-maintained subset.
-- Run after 001; no legacy profile is modified or deleted.
-- A future CI preflight fails if any original slug is absent from this file.
BEGIN;
INSERT INTO public.aesh_directory_reserved(role,owner_slug) VALUES
('student','امیر-بابایی'),
('student','امیر-رییسی'),
('student','امیر-ملک-رییسی'),
('student','امیر-مهدی'),
('student','امیر-مهدی-دهقان'),
('student','امیر-مهدی-هنرجو'),
('student','ایلیا-محمدی'),
('student','باربد-عاجلو'),
('student','سپهر-حیدری'),
('student','سپهر-یحیی-پور'),
('student','علیرضا-کیانی'),
('student','محمد-جواد-ساسانی'),
('student','محمد-هادی-جهانی-مجد'),
('student','مهدی-صابر'),
('teacher','اعلی-جوادی'),
('teacher','امیر-رضا-صفدری'),
('teacher','امیر-نصیری'),
('teacher','امیرحافظ-جعفری'),
('teacher','امیرعلی-رمضانی'),
('teacher','امیرعلی-رهنما'),
('teacher','امیرعلی-علوی'),
('teacher','ایمان-صالحی'),
('teacher','ایمان-میرزایی'),
('teacher','دانیال-تبریزی'),
('teacher','رهام-اکبری'),
('teacher','سبحان-جلیلی-فر'),
('teacher','سید-علی-محمد-کاشی'),
('teacher','سید-علیرضا-روح-زمین'),
('teacher','مهدی-اخلاقی'),
('teacher','مهدی-رافعی'),
('teacher','پوریا-ملایی'),
('teacher','کسری-ثابت'),
('teacher','کمیل-احسانی')
ON CONFLICT (role,owner_slug) DO NOTHING;
COMMIT;
