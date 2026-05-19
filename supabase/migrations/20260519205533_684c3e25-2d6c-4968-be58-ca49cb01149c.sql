
ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS desc_chunk_status text,
  ADD COLUMN IF NOT EXISTS desc_chunk_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS desc_chunk_claim_id uuid;

CREATE INDEX IF NOT EXISTS idx_episodes_desc_chunk_pending
  ON public.episodes (published_at DESC NULLS LAST)
  WHERE desc_chunk_status='pending';

CREATE INDEX IF NOT EXISTS idx_episodes_desc_chunk_claimed
  ON public.episodes (desc_chunk_claimed_at)
  WHERE desc_chunk_status='claimed';

CREATE OR REPLACE FUNCTION public.claim_description_chunk_jobs(_limit int, _worker uuid)
RETURNS TABLE(id uuid, podcast_id uuid, description text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT e.id FROM public.episodes e
    WHERE e.desc_chunk_status='pending'
    ORDER BY e.published_at DESC NULLS LAST
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.episodes ep
  SET desc_chunk_status='claimed',
      desc_chunk_claimed_at=now(),
      desc_chunk_claim_id=_worker
  FROM cte
  WHERE ep.id = cte.id
  RETURNING ep.id, ep.podcast_id, ep.description;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_description_chunk_job(_episode_id uuid, _status text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.episodes
  SET desc_chunk_status = CASE WHEN _status IN ('done','skipped','failed') THEN _status ELSE 'done' END,
      desc_chunk_claimed_at = NULL,
      desc_chunk_claim_id = NULL
  WHERE id = _episode_id;
$$;

CREATE OR REPLACE FUNCTION public.reap_description_chunk_stale_claims()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  WITH upd AS (
    UPDATE public.episodes
    SET desc_chunk_status='pending',
        desc_chunk_claimed_at=NULL,
        desc_chunk_claim_id=NULL
    WHERE desc_chunk_status='claimed'
      AND desc_chunk_claimed_at < now() - interval '5 minutes'
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.description_chunk_drain_stats()
RETURNS TABLE(pending bigint, claimed bigint, done bigint, failed bigint, skipped bigint, stale_claims bigint, total_desc_chunks bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*) FROM public.episodes WHERE desc_chunk_status='pending'),
    (SELECT count(*) FROM public.episodes WHERE desc_chunk_status='claimed'),
    (SELECT count(*) FROM public.episodes WHERE desc_chunk_status='done'),
    (SELECT count(*) FROM public.episodes WHERE desc_chunk_status='failed'),
    (SELECT count(*) FROM public.episodes WHERE desc_chunk_status='skipped'),
    (SELECT count(*) FROM public.episodes WHERE desc_chunk_status='claimed' AND desc_chunk_claimed_at < now() - interval '5 minutes'),
    (SELECT count(*) FROM public.episode_chunks WHERE source='description');
$$;

CREATE OR REPLACE FUNCTION public.select_description_chunk_candidates(_limit integer DEFAULT 80)
RETURNS TABLE(id uuid, podcast_id uuid, description text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.id, e.podcast_id, e.description
  FROM public.episodes e
  WHERE e.desc_chunk_status='pending'
  ORDER BY e.published_at DESC NULLS LAST
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.description_chunk_drain_stats() TO anon, authenticated;
