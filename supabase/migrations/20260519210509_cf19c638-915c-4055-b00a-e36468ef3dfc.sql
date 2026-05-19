-- Batched, resumable backfill RPCs for desc_chunk_status
-- Each call processes one batch and returns rows updated. Driver loops until 0.

CREATE OR REPLACE FUNCTION public.backfill_desc_chunk_status_done_batch(p_batch int DEFAULT 5000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL statement_timeout = '120000';
  WITH cand AS (
    SELECT DISTINCT ec.episode_id
    FROM public.episode_chunks ec
    WHERE ec.source = 'description'
      AND EXISTS (
        SELECT 1 FROM public.episodes e
        WHERE e.id = ec.episode_id
          AND e.desc_chunk_status IS DISTINCT FROM 'done'
      )
    LIMIT p_batch
  ),
  upd AS (
    UPDATE public.episodes e
    SET desc_chunk_status = 'done'
    FROM cand
    WHERE e.id = cand.episode_id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END
$$;

CREATE OR REPLACE FUNCTION public.backfill_desc_chunk_status_pending_batch(p_batch int DEFAULT 5000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL statement_timeout = '180000';
  WITH cand AS (
    SELECT id FROM public.episodes
    WHERE desc_chunk_status IS NULL
      AND length(coalesce(description,'')) > 1600
    LIMIT p_batch
  ),
  upd AS (
    UPDATE public.episodes e
    SET desc_chunk_status = 'pending'
    FROM cand
    WHERE e.id = cand.id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END
$$;

CREATE OR REPLACE FUNCTION public.backfill_desc_chunk_status_skipped_batch(p_batch int DEFAULT 10000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SET LOCAL statement_timeout = '180000';
  WITH cand AS (
    SELECT id FROM public.episodes
    WHERE desc_chunk_status IS NULL
    LIMIT p_batch
  ),
  upd AS (
    UPDATE public.episodes e
    SET desc_chunk_status = 'skipped'
    FROM cand
    WHERE e.id = cand.id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END
$$;