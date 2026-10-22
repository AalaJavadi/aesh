-- AESH 5.0 / 004 — SECURE PRIVATE WORK IMAGES (TEST FIRST; REVIEW BEFORE PROD).
-- Prerequisite: deploy aesh-approved-media Edge Function and confirm it works
-- with currently published artifacts IN AN ISOLATED TEST PROJECT.
-- This deliberately changes bucket *visibility* but never modifies/deletes files.
-- Work images become private; the public Edge gateway validates published works.
-- DO NOT run blindly on a live project. Inventory every existing Storage SELECT policy.
BEGIN;
DO $$
BEGIN
 IF (SELECT count(*) FROM storage.buckets WHERE id IN
   ('aesh-member-works','aesh-owner-works','aesh-work-thumbs')) <> 3
 THEN RAISE EXCEPTION 'AESH5: required buckets missing — no changes applied'; END IF;
 IF to_regprocedure('public.aesh_5_is_owner()') IS NULL
 THEN RAISE EXCEPTION 'AESH5: migration 001 prerequisite missing'; END IF;
END $$;
UPDATE storage.buckets SET public=false
WHERE id IN ('aesh-member-works','aesh-owner-works','aesh-work-thumbs') AND public=true;
-- RESTRICTIVE applies alongside ALL existing permissive policies. Even an overly
-- broad legacy SELECT policy cannot authorize anonymous access to these buckets.
-- Other buckets are unaffected. Members browse published works via the Edge gateway.
DROP POLICY IF EXISTS aesh5_work_private_read_fence ON storage.objects;
CREATE POLICY aesh5_work_private_read_fence
ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING (
 bucket_id NOT IN ('aesh-member-works','aesh-owner-works','aesh-work-thumbs')
 OR (CASE WHEN auth.uid() IS NULL THEN false ELSE public.aesh_5_is_owner() END)
);
DROP POLICY IF EXISTS aesh5_work_manager_review_select ON storage.objects;
CREATE POLICY aesh5_work_manager_review_select
ON storage.objects FOR SELECT TO authenticated
USING (
 bucket_id IN ('aesh-member-works','aesh-owner-works','aesh-work-thumbs')
 AND public.aesh_5_is_owner()
);
-- Public RPC returns a BOOLEAN only. The existing aesh_public_works()
-- must be known to expose PUBLISHED works only; verify its SQL in TEST.
-- This avoids one full REST gallery download for every image request.
CREATE OR REPLACE FUNCTION public.aesh_5_approved_media(p_bucket text,p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.aesh_public_works() AS w
   WHERE (w.bucket_id = p_bucket AND w.object_path = p_path)
      OR (p_bucket = 'aesh-work-thumbs' AND w.thumb_path = p_path)
 );
$$;
REVOKE ALL ON FUNCTION public.aesh_5_approved_media(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aesh_5_approved_media(text,text) TO anon,authenticated;
-- Authenticated users need a read-only way to check privacy BEFORE uploading.
CREATE OR REPLACE FUNCTION public.aesh_5_work_buckets_private()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT (SELECT count(*) FROM storage.buckets
         WHERE id IN ('aesh-member-works','aesh-owner-works','aesh-work-thumbs')
           AND public = false) = 3;
$$;
REVOKE ALL ON FUNCTION public.aesh_5_work_buckets_private() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aesh_5_work_buckets_private() TO anon,authenticated;
-- This exposes a privacy BOOLEAN only; no bucket files, paths or credentials.
COMMIT;
-- FAIL CLOSED: requires an actual anon HTTP read test on a known pending object.
-- Read-only review: SELECT id,public FROM storage.buckets WHERE id LIKE 'aesh-%';
