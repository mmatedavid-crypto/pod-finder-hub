
CREATE TABLE IF NOT EXISTS public.yt_url_backfill_attempts (
  episode_id uuid PRIMARY KEY,
  podcast_id uuid NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  matched_video_id text,
  match_score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.yt_url_backfill_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_yt_backfill_next ON public.yt_url_backfill_attempts(next_attempt_at) WHERE status NOT IN ('found','not_available');
CREATE INDEX IF NOT EXISTS idx_yt_backfill_status ON public.yt_url_backfill_attempts(status);

CREATE OR REPLACE FUNCTION public.select_yt_backfill_candidates(_limit int DEFAULT 50)
RETURNS TABLE(id uuid, podcast_id uuid, episode_title text, podcast_title text, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.podcast_id, e.title, p.title, e.published_at
  FROM public.episodes e
  JOIN public.podcasts p ON p.id = e.podcast_id
  LEFT JOIN public.yt_url_backfill_attempts a ON a.episode_id = e.id
  WHERE e.youtube_url IS NULL
    AND p.shadow_rank_tier IN ('S','A')
    AND (p.language IS NULL OR p.language ILIKE 'en%')
    AND COALESCE(a.status, 'pending') NOT IN ('found','not_available')
    AND (a.next_attempt_at IS NULL OR a.next_attempt_at < now())
    AND e.title IS NOT NULL AND length(e.title) > 3
  ORDER BY p.shadow_rank_tier ASC, e.published_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(200, _limit));
$$;

CREATE OR REPLACE FUNCTION public.yt_backfill_stats()
RETURNS TABLE(pending bigint, found bigint, not_available bigint, failed bigint, total_eligible bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM public.episodes e
      JOIN public.podcasts p ON p.id = e.podcast_id
      LEFT JOIN public.yt_url_backfill_attempts a ON a.episode_id = e.id
      WHERE e.youtube_url IS NULL AND p.shadow_rank_tier IN ('S','A')
        AND (p.language IS NULL OR p.language ILIKE 'en%')
        AND COALESCE(a.status,'pending') NOT IN ('found','not_available')
        AND (a.next_attempt_at IS NULL OR a.next_attempt_at < now()))::bigint,
    (SELECT count(*) FROM public.yt_url_backfill_attempts WHERE status='found')::bigint,
    (SELECT count(*) FROM public.yt_url_backfill_attempts WHERE status='not_available')::bigint,
    (SELECT count(*) FROM public.yt_url_backfill_attempts WHERE status='failed')::bigint,
    (SELECT count(*) FROM public.episodes e
      JOIN public.podcasts p ON p.id = e.podcast_id
      WHERE p.shadow_rank_tier IN ('S','A') AND (p.language IS NULL OR p.language ILIKE 'en%'))::bigint;
$$;

CREATE OR REPLACE FUNCTION public.set_yt_backfill_schedule(_schedule text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _allowed text[] := ARRAY['*/30 * * * *','0 * * * *','0 */2 * * *','0 */6 * * *','0 4 * * *'];
BEGIN
  IF NOT (_schedule = ANY(_allowed)) THEN RAISE EXCEPTION 'schedule not in allowlist: %', _schedule; END IF;
  PERFORM cron.alter_job(jobid := (SELECT jobid FROM cron.job WHERE jobname='yt-backfill-runner'), schedule := _schedule);
END;
$$;
