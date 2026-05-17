
-- 1) Pause transcript chunking; controls keep state
UPDATE app_settings 
SET value = value || jsonb_build_object(
  'enabled', false,
  'auto_paused_reason', 'description_backfill_priority',
  'auto_paused_at', now()::text
), updated_at = now()
WHERE key = 'embed_chunks_controls';

-- 2) Description runner controls ($10/day, 2500/300 chunks)
INSERT INTO app_settings (key, value, updated_at)
VALUES ('embed_description_controls', jsonb_build_object(
  'enabled', true,
  'model', 'google/gemini-embedding-001',
  'daily_budget_usd', 10,
  'batch_size', 80,
  'concurrency', 8,
  'chunk_size', 2500,
  'chunk_overlap', 300,
  'min_desc_length', 1600
), now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 3) RPCs
CREATE OR REPLACE FUNCTION public.select_description_chunk_candidates(_limit int DEFAULT 80)
RETURNS TABLE (id uuid, podcast_id uuid, description text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.podcast_id, e.description
  FROM episodes e
  WHERE e.description IS NOT NULL
    AND length(e.description) > 1600
    AND NOT EXISTS (
      SELECT 1 FROM episode_chunks ec
      WHERE ec.episode_id = e.id AND ec.source = 'description'
    )
  ORDER BY e.published_at DESC NULLS LAST
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.description_chunk_candidate_stats()
RETURNS TABLE (pending bigint, done_episodes bigint, total_desc_chunks bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT COUNT(*) FROM episodes e WHERE length(e.description) > 1600
       AND NOT EXISTS (SELECT 1 FROM episode_chunks ec WHERE ec.episode_id=e.id AND ec.source='description')) AS pending,
    (SELECT COUNT(DISTINCT episode_id) FROM episode_chunks WHERE source='description') AS done_episodes,
    (SELECT COUNT(*) FROM episode_chunks WHERE source='description') AS total_desc_chunks;
$$;

CREATE OR REPLACE FUNCTION public.set_embed_description_schedule(_schedule text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE
  v_allowed text[] := ARRAY['* * * * *','*/2 * * * *','*/5 * * * *','*/10 * * * *','*/15 * * * *','*/30 * * * *'];
BEGIN
  IF NOT (_schedule = ANY(v_allowed)) THEN RAISE EXCEPTION 'invalid schedule: %', _schedule; END IF;
  PERFORM cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname='embed-description-runner'), schedule := _schedule);
END $$;

-- 4) Cron job
SELECT cron.schedule(
  'embed-description-runner',
  '*/2 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://iqzkayoqqagowvxeaphe.supabase.co/functions/v1/embed-description-runner',
    headers := '{"apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxemtheW9xcWFnb3d2eGVhcGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDA3NzAsImV4cCI6MjA5MzU3Njc3MH0.KaeRcYcljGjrP_OAcTp_lapPSRsAYRq6gPJ2vYV7fz4", "Content-Type": "application/json"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb,
    timeout_milliseconds := 115000
  );
  $job$
);
