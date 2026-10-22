-- AESH 5.0 / 001 - ADDITIVE ONLY. Run on an EMPTY TEST CLONE first.
-- No legacy member/work table is dropped or rewritten.
-- Requires existing public.aesh_my_profile() to return a role column, with 'owner' for admins.
BEGIN;
CREATE TABLE IF NOT EXISTS public.aesh_directory_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 role text NOT NULL CHECK (role IN ('teacher','student')),
 owner_slug text NOT NULL,
 display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
 specialty text NOT NULL DEFAULT '' CHECK (char_length(specialty) <= 160),
 skills text NOT NULL DEFAULT '' CHECK (char_length(skills) <= 320),
 bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 700),
 image_path text,
 extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra)='object'),
 published boolean NOT NULL DEFAULT false,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(role,owner_slug),
 CONSTRAINT aesh_directory_valid_slug CHECK (char_length(owner_slug) BETWEEN 2 AND 90 AND owner_slug ~ '^[A-Za-z0-9ء-ی]+(-[A-Za-z0-9ء-ی]+)*$'),
 CONSTRAINT aesh_directory_image_path CHECK (image_path IS NULL OR image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$')
);
CREATE TABLE IF NOT EXISTS public.aesh_directory_reserved (
 role text NOT NULL CHECK (role IN ('teacher','student')),
 owner_slug text NOT NULL,
 PRIMARY KEY(role,owner_slug)
);
ALTER TABLE public.aesh_directory_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aesh_directory_reserved ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aesh_directory_profiles FROM anon,authenticated;
REVOKE ALL ON public.aesh_directory_reserved FROM anon,authenticated;

CREATE TABLE IF NOT EXISTS public.aesh_association_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 70),
 body text NOT NULL CHECK (char_length(body) BETWEEN 5 AND 1200),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 moderated_at timestamptz,
 moderated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS aesh_reviews_status_created_idx ON public.aesh_association_reviews(status,created_at DESC);
ALTER TABLE public.aesh_association_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aesh_association_reviews FROM anon,authenticated;

-- Every privileged RPC validates role from the existing server-side Auth profile.
-- Never treat a client-provided owner flag or localStorage role as authorization.
CREATE OR REPLACE FUNCTION public.aesh_5_is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.aesh_my_profile() AS p WHERE p.role = 'owner'
 );
$$;
REVOKE ALL ON FUNCTION public.aesh_5_is_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aesh_5_is_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.aesh_public_directory()
RETURNS TABLE(id uuid,role text,owner_slug text,display_name text,specialty text,skills text,bio text,avatar_path text,extra jsonb,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p.id,p.role,p.owner_slug,p.display_name,p.specialty,p.skills,p.bio,p.image_path,p.extra,p.updated_at
 FROM public.aesh_directory_profiles p WHERE p.published = true
 ORDER BY p.created_at DESC LIMIT 500;
$$;
REVOKE ALL ON FUNCTION public.aesh_public_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aesh_public_directory() TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.aesh_owner_directory()
RETURNS SETOF public.aesh_directory_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.aesh_5_is_owner() THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501'; END IF;
 RETURN QUERY SELECT p.* FROM public.aesh_directory_profiles p ORDER BY p.created_at DESC LIMIT 500;
END;
$$;
REVOKE ALL ON FUNCTION public.aesh_owner_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aesh_owner_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.aesh_owner_save_directory(
 p_id uuid,p_role text,p_owner_slug text,p_display_name text,p_specialty text,p_skills text,
 p_bio text,p_image_path text,p_published boolean,p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE saved uuid; current_profile public.aesh_directory_profiles%ROWTYPE;
BEGIN
 IF NOT public.aesh_5_is_owner() THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_role NOT IN ('teacher','student') OR p_owner_slug IS NULL OR
    char_length(p_owner_slug) NOT BETWEEN 2 AND 90 OR
    p_owner_slug !~ '^[A-Za-z0-9ء-ی]+(-[A-Za-z0-9ء-ی]+)*$' OR
    char_length(btrim(coalesce(p_display_name,''))) NOT BETWEEN 2 AND 120 OR
    char_length(coalesce(p_specialty,'')) > 160 OR char_length(coalesce(p_skills,'')) > 320 OR
    char_length(coalesce(p_bio,'')) > 700 OR jsonb_typeof(coalesce(p_extra,'{}'::jsonb)) <> 'object' OR
    (p_image_path IS NOT NULL AND p_image_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$')
 THEN RAISE EXCEPTION 'INVALID_PROFILE_DATA' USING ERRCODE='22023'; END IF;
 IF p_id IS NULL THEN
   IF EXISTS(SELECT 1 FROM public.aesh_directory_reserved r WHERE r.role=p_role AND r.owner_slug=p_owner_slug)
   THEN RAISE EXCEPTION 'SLUG_RESERVED_BY_EXISTING_MEMBER' USING ERRCODE='23505'; END IF;
   INSERT INTO public.aesh_directory_profiles(role,owner_slug,display_name,specialty,skills,bio,image_path,extra,published,created_by)
   VALUES(p_role,p_owner_slug,btrim(p_display_name),coalesce(p_specialty,''),coalesce(p_skills,''),coalesce(p_bio,''),p_image_path,coalesce(p_extra,'{}'::jsonb),coalesce(p_published,false),auth.uid())
   RETURNING id INTO saved;
 ELSE
   SELECT * INTO current_profile FROM public.aesh_directory_profiles WHERE id=p_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   IF current_profile.role<>p_role OR current_profile.owner_slug<>p_owner_slug
   THEN RAISE EXCEPTION 'ROLE_AND_SLUG_ARE_IMMUTABLE' USING ERRCODE='22023'; END IF;
   UPDATE public.aesh_directory_profiles SET display_name=btrim(p_display_name),specialty=coalesce(p_specialty,''),
     skills=coalesce(p_skills,''),bio=coalesce(p_bio,''),image_path=p_image_path,
     extra=coalesce(p_extra,'{}'::jsonb),published=coalesce(p_published,false),updated_at=now()
   WHERE id=p_id RETURNING id INTO saved;
 END IF;
 RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.aesh_owner_save_directory(uuid,text,text,text,text,text,text,text,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aesh_owner_save_directory(uuid,text,text,text,text,text,text,text,boolean,jsonb) TO authenticated;

-- Submit RPC exposes no status argument. Every review is pending, even if the
-- caller crafts a custom HTTP request. A global per-minute limiter provides a
-- safety backstop; use an edge CAPTCHA/rate limiting gateway before large launch.
CREATE OR REPLACE FUNCTION public.aesh_submit_review(p_display_name text,p_body text,p_website text DEFAULT '')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n text := btrim(coalesce(p_display_name,'')); b text := btrim(coalesce(p_body,''));
BEGIN
 IF length(coalesce(p_website,''))>0 THEN RETURN true; END IF; -- honeypot
 IF char_length(n) NOT BETWEEN 2 AND 70 OR char_length(b) NOT BETWEEN 5 AND 1200 OR
    n ~ '[<>]' OR b ~ '[<>]' THEN RAISE EXCEPTION 'INVALID_REVIEW' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(55109,1);
 IF (SELECT count(*) FROM public.aesh_association_reviews WHERE created_at > now()-interval '1 minute')>=20
 THEN RAISE EXCEPTION 'SUBMISSION_RATE_LIMITED' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.aesh_association_reviews(display_name,body,status) VALUES(n,b,'pending');
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.aesh_submit_review(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aesh_submit_review(text,text,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.aesh_public_reviews()
RETURNS TABLE(id uuid,display_name text,body text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT r.id,r.display_name,r.body,r.created_at FROM public.aesh_association_reviews r
 WHERE r.status='approved' ORDER BY r.moderated_at DESC NULLS LAST,r.created_at DESC LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.aesh_public_reviews() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aesh_public_reviews() TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.aesh_owner_reviews()
RETURNS TABLE(id uuid,display_name text,body text,status text,created_at timestamptz,moderated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.aesh_5_is_owner() THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT r.id,r.display_name,r.body,r.status,r.created_at,r.moderated_at
 FROM public.aesh_association_reviews r ORDER BY r.created_at DESC LIMIT 300;
END;
$$;
REVOKE ALL ON FUNCTION public.aesh_owner_reviews() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aesh_owner_reviews() TO authenticated;

CREATE OR REPLACE FUNCTION public.aesh_owner_moderate_review(p_review_id uuid,p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.aesh_5_is_owner() THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN ('approved','rejected','pending') THEN RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE='22023'; END IF;
 UPDATE public.aesh_association_reviews SET status=p_status,moderated_at=now(),moderated_by=auth.uid()
 WHERE id=p_review_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.aesh_owner_moderate_review(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aesh_owner_moderate_review(uuid,text) TO authenticated;
COMMIT;
