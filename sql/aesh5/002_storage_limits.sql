-- AESH 5.0 / 002: enforce <100000 bytes IN STORAGE, not just the browser.
-- Modifies upload limits ONLY; no old image is deleted or recompressed.
-- IMPORTANT: run after existing bucket/policy configuration is backed up.
-- This migration does NOT touch work-bucket visibility. Work privacy is audited separately.
BEGIN;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('aesh-directory','aesh-directory',true,99999,ARRAY['image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET file_size_limit=99999,allowed_mime_types=ARRAY['image/webp']::text[];
-- Do not overwrite original public/private flags, object access policies, or existing objects.
UPDATE storage.buckets SET file_size_limit=99999
WHERE id IN ('aesh-member-works','aesh-owner-works','aesh-work-thumbs','aesh-avatars');
DO $$ BEGIN
 IF (SELECT COUNT(*) FROM storage.buckets WHERE id IN('aesh-member-works','aesh-owner-works','aesh-work-thumbs','aesh-avatars'))<>4
 THEN RAISE EXCEPTION 'One or more existing storage buckets are missing; abort'; END IF;
END $$;
DROP POLICY IF EXISTS aesh5_directory_owner_upload ON storage.objects;
-- Drop only the AESH5 policy created by an earlier TEST migration; new uploads never upsert.
DROP POLICY IF EXISTS aesh5_directory_owner_update ON storage.objects;
CREATE POLICY aesh5_directory_owner_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='aesh-directory' AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$' AND public.aesh_5_is_owner());
-- No SELECT or UPDATE grant is necessary for UUID-only INSERT operations.
COMMIT;
