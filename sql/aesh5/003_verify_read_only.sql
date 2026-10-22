-- READ-ONLY: Run on an isolated TEST database and archive the results.
-- DO NOT imply PASS merely because queries return rows.
SELECT proname,prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('aesh_my_profile','aesh_public_works','aesh_5_is_owner','aesh_5_approved_media',
 'aesh_5_work_buckets_private','aesh_public_directory','aesh_owner_save_directory',
 'aesh_submit_review','aesh_public_reviews','aesh_owner_reviews','aesh_owner_moderate_review');
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets
 WHERE id IN ('aesh-member-works','aesh-owner-works','aesh-work-thumbs','aesh-avatars','aesh-directory');
SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public'
 AND tablename IN('aesh_directory_profiles','aesh_directory_reserved','aesh_association_reviews');
SELECT role,count(*) AS reserved_legacy_slugs FROM public.aesh_directory_reserved GROUP BY role;
SELECT p.id,p.role,p.owner_slug,p.published FROM public.aesh_directory_profiles p
 INNER JOIN public.aesh_directory_reserved r USING(role,owner_slug);
-- Expect 0 rows from the previous query: no new profile collides with an old route.
SELECT count(*) AS pending_reviews FROM public.aesh_association_reviews WHERE status='pending';
SELECT policyname,permissive,roles,cmd,qual,with_check
 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
 ORDER BY policyname;
-- CRITICAL: independently review this function to ensure it returns *published*
-- works only. The public gateway's authorization is built on its correctness.
SELECT pg_get_functiondef(to_regprocedure('public.aesh_public_works()')) AS review_public_works_implementation;
