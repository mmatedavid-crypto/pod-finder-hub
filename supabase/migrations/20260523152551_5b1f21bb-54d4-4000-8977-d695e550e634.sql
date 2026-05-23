
ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS display_description text,
  ADD COLUMN IF NOT EXISTS description_cleaned_at timestamptz,
  ADD COLUMN IF NOT EXISTS description_cleanup_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS description_cleanup_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_podcasts_desc_cleanup_pending
  ON public.podcasts (id)
  WHERE description_cleanup_status = 'pending' AND description IS NOT NULL;

CREATE OR REPLACE FUNCTION public.select_description_cleanup_candidates(
  _limit int DEFAULT 200,
  _kind text DEFAULT 'episode'
)
RETURNS TABLE(id uuid, podcast_id uuid, title text, description text, tier text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _kind = 'podcast' THEN
    RETURN QUERY
      SELECT p.id, p.id AS podcast_id, COALESCE(p.display_title, p.title) AS title,
             p.description, COALESCE(p.shadow_rank_tier,'D') AS tier
      FROM public.podcasts p
      WHERE p.description_cleanup_status = 'pending'
        AND p.description IS NOT NULL AND length(p.description) > 0
        AND (p.language IS NULL OR p.language ILIKE 'en%')
      ORDER BY CASE COALESCE(p.shadow_rank_tier,'D')
        WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END
      LIMIT _limit;
  ELSE
    RETURN QUERY
      SELECT e.id, e.podcast_id, COALESCE(e.display_title, e.title) AS title,
             e.description, COALESCE(p.shadow_rank_tier,'D') AS tier
      FROM public.episodes e
      JOIN public.podcasts p ON p.id = e.podcast_id
      WHERE e.description_cleanup_status = 'pending'
        AND e.description IS NOT NULL AND length(e.description) > 0
        AND (p.language IS NULL OR p.language ILIKE 'en%')
      ORDER BY CASE COALESCE(p.shadow_rank_tier,'D')
        WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END,
        e.published_at DESC NULLS LAST
      LIMIT _limit;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.select_description_cleanup_candidates(int, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.description_cleanup_stats()
RETURNS TABLE(
  ep_pending bigint, ep_rules_ok bigint, ep_ai_refined bigint, ep_skipped bigint, ep_reverted bigint,
  pod_pending bigint, pod_rules_ok bigint, pod_ai_refined bigint, pod_skipped bigint, pod_reverted bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM public.episodes e JOIN public.podcasts p ON p.id=e.podcast_id
      WHERE e.description_cleanup_status='pending' AND (p.language IS NULL OR p.language ILIKE 'en%')
        AND e.description IS NOT NULL AND length(e.description)>0),
    (SELECT count(*) FROM public.episodes WHERE description_cleanup_status='rules_ok'),
    (SELECT count(*) FROM public.episodes WHERE description_cleanup_status='ai_refined'),
    (SELECT count(*) FROM public.episodes WHERE description_cleanup_status='skipped'),
    (SELECT count(*) FROM public.episodes WHERE description_cleanup_status='reverted'),
    (SELECT count(*) FROM public.podcasts WHERE description_cleanup_status='pending'
       AND (language IS NULL OR language ILIKE 'en%') AND description IS NOT NULL),
    (SELECT count(*) FROM public.podcasts WHERE description_cleanup_status='rules_ok'),
    (SELECT count(*) FROM public.podcasts WHERE description_cleanup_status='ai_refined'),
    (SELECT count(*) FROM public.podcasts WHERE description_cleanup_status='skipped'),
    (SELECT count(*) FROM public.podcasts WHERE description_cleanup_status='reverted');
$$;
GRANT EXECUTE ON FUNCTION public.description_cleanup_stats() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_description_cleanup_schedule(_schedule text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE _jobid int;
BEGIN
  IF _schedule NOT IN ('* * * * *','*/2 * * * *','*/5 * * * *','*/15 * * * *','*/30 * * * *') THEN
    RAISE EXCEPTION 'invalid schedule: %', _schedule;
  END IF;
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'description-cleanup-runner';
  IF _jobid IS NOT NULL THEN
    PERFORM cron.alter_job(_jobid, schedule := _schedule);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_description_cleanup_schedule(text) TO service_role;

CREATE INDEX IF NOT EXISTS idx_episodes_desc_cleanup_pending
  ON public.episodes (podcast_id, published_at DESC)
  WHERE description_cleanup_status = 'pending' AND description IS NOT NULL;
