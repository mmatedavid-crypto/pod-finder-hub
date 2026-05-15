
-- =========================================================
-- Part A: episode_chunks
-- =========================================================
CREATE TABLE IF NOT EXISTS public.episode_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  episode_id uuid NOT NULL,
  podcast_id uuid NOT NULL,
  chunk_idx smallint NOT NULL,
  source text NOT NULL CHECK (source IN ('description','transcript_rss','transcript_youtube')),
  text text NOT NULL,
  embedding vector(768) NOT NULL,
  content_hash text NOT NULL,
  model text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (episode_id, source, chunk_idx)
);

CREATE INDEX IF NOT EXISTS idx_episode_chunks_episode ON public.episode_chunks(episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_chunks_podcast ON public.episode_chunks(podcast_id);
CREATE INDEX IF NOT EXISTS idx_episode_chunks_hnsw ON public.episode_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

ALTER TABLE public.episode_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ep_chunks public read" ON public.episode_chunks;
CREATE POLICY "ep_chunks public read" ON public.episode_chunks FOR SELECT USING (true);
DROP POLICY IF EXISTS "ep_chunks admin write" ON public.episode_chunks;
CREATE POLICY "ep_chunks admin write" ON public.episode_chunks FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- Part B: episode_transcripts
-- =========================================================
CREATE TABLE IF NOT EXISTS public.episode_transcripts (
  episode_id uuid NOT NULL PRIMARY KEY,
  podcast_id uuid NOT NULL,
  source text CHECK (source IN ('rss','youtube')),
  transcript_url text,
  format text,
  text text,
  word_count integer,
  language text,
  status text NOT NULL DEFAULT 'unchecked' CHECK (status IN ('unchecked','found','not_available','failed')),
  attempts integer NOT NULL DEFAULT 0,
  fetched_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ep_transcripts_status ON public.episode_transcripts(status);
CREATE INDEX IF NOT EXISTS idx_ep_transcripts_podcast ON public.episode_transcripts(podcast_id);

ALTER TABLE public.episode_transcripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ep_transcripts public read" ON public.episode_transcripts;
CREATE POLICY "ep_transcripts public read" ON public.episode_transcripts FOR SELECT USING (true);
DROP POLICY IF EXISTS "ep_transcripts admin write" ON public.episode_transcripts;
CREATE POLICY "ep_transcripts admin write" ON public.episode_transcripts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- Episodes table additions
-- =========================================================
ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS transcript_status text DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS next_transcript_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS chunks_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS chunks_source_hash text,
  ADD COLUMN IF NOT EXISTS chunks_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_episodes_transcript_status ON public.episodes(transcript_status, next_transcript_check_at)
  WHERE transcript_status IN ('unchecked','failed');
CREATE INDEX IF NOT EXISTS idx_episodes_chunks_status ON public.episodes(chunks_status, podcast_id)
  WHERE chunks_status IN ('pending','stale');

-- =========================================================
-- RPC: candidate selection for chunk runner
-- Pick episodes with chunks_status pending/stale, prioritize by tier.
-- =========================================================
CREATE OR REPLACE FUNCTION public.select_chunk_candidates(_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  podcast_id uuid,
  description text,
  display_title text,
  podcast_title text,
  podcast_category text,
  shadow_rank_tier text,
  transcript_text text,
  transcript_source text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    e.id,
    e.podcast_id,
    e.description,
    COALESCE(e.display_title, e.title) AS display_title,
    COALESCE(p.display_title, p.title) AS podcast_title,
    p.category AS podcast_category,
    p.shadow_rank_tier,
    et.text AS transcript_text,
    et.source AS transcript_source
  FROM episodes e
  JOIN podcasts p ON p.id = e.podcast_id
  LEFT JOIN episode_transcripts et ON et.episode_id = e.id AND et.status = 'found'
  WHERE (e.chunks_status IS NULL OR e.chunks_status IN ('pending','stale'))
    AND (
      (et.text IS NOT NULL AND length(et.text) >= 500)
      OR (e.description IS NOT NULL AND length(e.description) >= 1000)
    )
    AND (p.language IS NULL OR p.language ILIKE 'en%')
    AND (p.shadow_rank_tier IS NULL OR p.shadow_rank_tier IN ('S','A','B','C'))
  ORDER BY
    CASE p.shadow_rank_tier WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 ELSE 5 END,
    e.published_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(500, _limit));
$$;

CREATE OR REPLACE FUNCTION public.chunk_candidate_stats()
RETURNS TABLE (pending bigint, total_chunks bigint, episodes_with_chunks bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM episodes e
       JOIN podcasts p ON p.id = e.podcast_id
       WHERE (e.chunks_status IS NULL OR e.chunks_status IN ('pending','stale'))
         AND (p.language IS NULL OR p.language ILIKE 'en%')
         AND (length(coalesce(e.description,'')) >= 1000)),
    (SELECT count(*) FROM episode_chunks),
    (SELECT count(DISTINCT episode_id) FROM episode_chunks);
$$;

-- =========================================================
-- RPC: candidate selection for transcript scout (S/A only)
-- =========================================================
CREATE OR REPLACE FUNCTION public.select_transcript_scout_candidates(_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  podcast_id uuid,
  rss_url text,
  guid text,
  episode_url text,
  audio_url text,
  youtube_url text,
  podcast_rss_url text,
  shadow_rank_tier text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    e.id, e.podcast_id, NULL::text AS rss_url,
    e.guid, e.episode_url, e.audio_url, e.youtube_url,
    p.rss_url AS podcast_rss_url,
    p.shadow_rank_tier
  FROM episodes e
  JOIN podcasts p ON p.id = e.podcast_id
  WHERE p.shadow_rank_tier IN ('S','A')
    AND (p.language IS NULL OR p.language ILIKE 'en%')
    AND (e.transcript_status IS NULL OR e.transcript_status = 'unchecked'
         OR (e.transcript_status = 'failed' AND (e.next_transcript_check_at IS NULL OR e.next_transcript_check_at < now())))
  ORDER BY
    CASE p.shadow_rank_tier WHEN 'S' THEN 1 ELSE 2 END,
    e.published_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(500, _limit));
$$;

CREATE OR REPLACE FUNCTION public.transcript_scout_stats()
RETURNS TABLE (
  unchecked bigint,
  found bigint,
  not_available bigint,
  failed bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM episodes e JOIN podcasts p ON p.id=e.podcast_id
       WHERE p.shadow_rank_tier IN ('S','A')
         AND (e.transcript_status IS NULL OR e.transcript_status='unchecked')),
    (SELECT count(*) FROM episode_transcripts WHERE status='found'),
    (SELECT count(*) FROM episode_transcripts WHERE status='not_available'),
    (SELECT count(*) FROM episode_transcripts WHERE status='failed');
$$;

-- =========================================================
-- Adaptive cron RPCs
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_embed_chunks_schedule(_schedule text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _schedule NOT IN ('* * * * *','*/2 * * * *','*/5 * * * *','*/10 * * * *','*/15 * * * *','*/30 * * * *') THEN
    RAISE EXCEPTION 'invalid_schedule: %', _schedule;
  END IF;
  PERFORM cron.alter_job(40, schedule := _schedule);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_transcript_scout_schedule(_schedule text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _schedule NOT IN ('* * * * *','*/5 * * * *','*/10 * * * *','*/15 * * * *','*/30 * * * *','0 * * * *','0 */6 * * *') THEN
    RAISE EXCEPTION 'invalid_schedule: %', _schedule;
  END IF;
  PERFORM cron.alter_job(41, schedule := _schedule);
END;
$$;

-- =========================================================
-- Search RPC: vector search across chunks, MAX-aggregated per episode
-- =========================================================
CREATE OR REPLACE FUNCTION public.search_episode_chunks(
  query_embedding vector(768),
  match_count integer DEFAULT 80,
  candidate_pool integer DEFAULT 400
)
RETURNS TABLE (
  episode_id uuid,
  podcast_id uuid,
  best_chunk_idx smallint,
  best_source text,
  best_text text,
  similarity real
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pool AS (
    SELECT
      c.episode_id, c.podcast_id, c.chunk_idx, c.source, c.text,
      1 - (c.embedding <=> query_embedding) AS sim
    FROM episode_chunks c
    ORDER BY c.embedding <=> query_embedding
    LIMIT GREATEST(50, candidate_pool)
  ),
  ranked AS (
    SELECT *,
      row_number() OVER (PARTITION BY episode_id ORDER BY sim DESC) AS rn
    FROM pool
  )
  SELECT episode_id, podcast_id, chunk_idx::smallint, source, text, sim::real
  FROM ranked
  WHERE rn = 1
  ORDER BY sim DESC
  LIMIT GREATEST(1, match_count);
$$;

-- =========================================================
-- Cron jobs (40 + 41) — initial schedule
-- =========================================================
DO $$
DECLARE
  fn_url text := 'https://iqzkayoqqagowvxeaphe.supabase.co/functions/v1';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxemtheW9xcWFnb3d2eGVhcGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDA3NzAsImV4cCI6MjA5MzU3Njc3MH0.KaeRcYcljGjrP_OAcTp_lapPSRsAYRq6gPJ2vYV7fz4';
BEGIN
  -- Remove if previously created
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobid IN (40, 41);

  PERFORM cron.schedule(
    'embed-chunks-runner',
    '*/5 * * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := %L::jsonb
      );
    $cron$,
      fn_url || '/embed-chunks-runner',
      jsonb_build_object('Content-Type','application/json','apikey', anon_key)::text,
      '{"batch":50,"concurrency":4}')
  );

  PERFORM cron.schedule(
    'transcript-scout-runner',
    '*/10 * * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := %L::jsonb
      );
    $cron$,
      fn_url || '/transcript-scout-runner',
      jsonb_build_object('Content-Type','application/json','apikey', anon_key)::text,
      '{"batch":50,"concurrency":4}')
  );
END $$;

-- Initial controls
INSERT INTO public.app_settings (key, value, updated_at)
VALUES
  ('embed_chunks_controls', '{"enabled":true,"daily_budget_usd":1.0,"model":"google/text-embedding-004","batch_size":50,"concurrency":4,"chunk_size":800,"chunk_overlap":200}'::jsonb, now()),
  ('transcript_scout_controls', '{"enabled":true,"batch_size":50,"concurrency":4,"backoff_days":[7,30]}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
