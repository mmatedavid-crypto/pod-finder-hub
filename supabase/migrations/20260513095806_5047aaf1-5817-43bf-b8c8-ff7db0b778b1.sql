-- 1. Claim helper filtered by kind (FOR UPDATE SKIP LOCKED, tier-aware order).
CREATE OR REPLACE FUNCTION public.claim_ai_jobs_by_kinds(
  _kinds text[],
  _limit integer,
  _lock_seconds integer DEFAULT 120
)
RETURNS SETOF public.ai_enrichment_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.ai_enrichment_jobs j
     SET status = 'processing',
         locked_until = now() + make_interval(secs => _lock_seconds),
         started_at = now(),
         attempts = attempts + 1
   WHERE j.id IN (
     SELECT id FROM public.ai_enrichment_jobs
      WHERE kind = ANY(_kinds)
        AND ((status = 'pending')
          OR (status = 'processing' AND locked_until < now()))
      ORDER BY priority DESC, created_at ASC
      LIMIT _limit
      FOR UPDATE SKIP LOCKED
   )
   RETURNING *;
END $$;

-- 2. Top-up enqueue: adds entity_episode jobs for S/A EN podcasts whose
-- episodes have content but no entities yet. Bounded so it can be called
-- safely from the runner each tick.
CREATE OR REPLACE FUNCTION public.entity_extract_enqueue(_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer;
BEGIN
  WITH cand AS (
    SELECT
      e.id,
      CASE p.rank_label WHEN 'S' THEN 100 WHEN 'A' THEN 80 ELSE 60 END AS pr,
      md5('entity_v1:' || e.id::text) AS h
    FROM public.episodes e
    JOIN public.podcasts p ON p.id = e.podcast_id
    WHERE p.rank_label IN ('S','A')
      AND (p.language IS NULL OR p.language ILIKE 'en%')
      AND COALESCE(array_length(e.people,1),0)
        + COALESCE(array_length(e.companies,1),0)
        + COALESCE(array_length(e.tickers,1),0)
        + COALESCE(array_length(e.topics,1),0) = 0
      AND (e.ai_summary IS NOT NULL OR e.summary IS NOT NULL OR e.description IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.ai_enrichment_jobs j
         WHERE j.kind = 'entity_episode'
           AND j.target_type = 'episode'
           AND j.target_id = e.id
           AND j.status IN ('pending','processing','done')
      )
    ORDER BY pr DESC, e.published_at DESC NULLS LAST
    LIMIT _limit
  )
  INSERT INTO public.ai_enrichment_jobs(kind, target_type, target_id, input_hash, priority, status)
  SELECT 'entity_episode', 'episode', id, h, pr, 'pending'
    FROM cand
  ON CONFLICT (kind, target_type, target_id, input_hash) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END $$;

-- 3. Adaptive cron schedule helper for entity-extract-runner.
CREATE OR REPLACE FUNCTION public.set_entity_extract_runner_schedule(_schedule text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF _schedule NOT IN ('* * * * *','*/2 * * * *','*/5 * * * *','*/10 * * * *','*/30 * * * *') THEN
    RAISE EXCEPTION 'invalid schedule: %', _schedule;
  END IF;
  PERFORM cron.alter_job(
    job_id := (SELECT jobid FROM cron.job WHERE jobname = 'entity-extract-runner'),
    schedule := _schedule
  );
END $$;