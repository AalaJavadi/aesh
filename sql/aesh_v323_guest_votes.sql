-- AESH v3.23 / Supabase SQL Editor (run once, as the project administrator).
-- Stores anonymous browser votes separately from the existing logged-in voting system.
-- No guest INSERT/UPDATE/DELETE is permitted directly: only validated RPCs can change votes.
-- Guest browser IDs are pseudonymous, NOT proof of a unique person.

BEGIN;

CREATE TABLE IF NOT EXISTS public.aesh_guest_votes (
  work_key text NOT NULL,
  visitor_id uuid NOT NULL,
  vote smallint NOT NULL CHECK (vote IN (-1,1)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_key, visitor_id),
  CONSTRAINT aesh_guest_vote_key_length CHECK (char_length(work_key) BETWEEN 8 AND 150)
);

CREATE INDEX IF NOT EXISTS aesh_guest_votes_work_idx
  ON public.aesh_guest_votes (work_key);
ALTER TABLE public.aesh_guest_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aesh_guest_votes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aesh_guest_vote_summary(
  p_work_key text, p_visitor_id uuid
) RETURNS TABLE(likes bigint, dislikes bigint, my_vote integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
 SELECT
   count(*) FILTER (WHERE vote = 1) AS likes,
   count(*) FILTER (WHERE vote = -1) AS dislikes,
   coalesce(max(CASE WHEN visitor_id = p_visitor_id THEN vote END), 0)::integer AS my_vote
 FROM public.aesh_guest_votes
 WHERE work_key = p_work_key;
$function$;

CREATE OR REPLACE FUNCTION public.aesh_guest_set_vote(
  p_work_key text, p_visitor_id uuid, p_vote integer
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE
  voting_count integer;
BEGIN
  -- Accept the existing site's static IDs and real cloud-work UUID keys only.
  IF p_work_key IS NULL OR
     NOT (p_work_key ~ '^legacy:[A-Za-z0-9_-]{1,90}$' OR
          p_work_key ~ '^cloud:[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$')
     OR p_visitor_id IS NULL OR p_vote IS NULL OR p_vote NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'Invalid work, visitor or vote';
  END IF;

  IF p_vote = 0 THEN
    DELETE FROM public.aesh_guest_votes
      WHERE work_key = p_work_key AND visitor_id = p_visitor_id;
    RETURN;
  END IF;

  -- Basic per-browser storage limit. Determined attackers can still rotate visitor IDs.
  SELECT count(*) INTO voting_count FROM public.aesh_guest_votes
    WHERE visitor_id = p_visitor_id;
  IF voting_count >= 200 AND NOT EXISTS (
    SELECT 1 FROM public.aesh_guest_votes
    WHERE work_key = p_work_key AND visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Browser vote limit reached';
  END IF;

  INSERT INTO public.aesh_guest_votes(work_key, visitor_id, vote)
  VALUES (p_work_key, p_visitor_id, p_vote::smallint)
  ON CONFLICT (work_key, visitor_id) DO UPDATE SET
    vote = EXCLUDED.vote,
    updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.aesh_guest_vote_summary(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aesh_guest_set_vote(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aesh_guest_vote_summary(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aesh_guest_set_vote(text, uuid, integer) TO anon, authenticated;

COMMIT;
