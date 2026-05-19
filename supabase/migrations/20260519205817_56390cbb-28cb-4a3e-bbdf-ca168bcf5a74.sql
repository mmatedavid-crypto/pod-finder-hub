
CREATE OR REPLACE FUNCTION public.backfill_desc_chunk_status_done(_limit int DEFAULT 5000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  WITH cte AS (
    SELECT DISTINCT episode_id
    FROM public.episode_chunks
    WHERE source='description'
    LIMIT _limit * 4
  ), upd AS (
    UPDATE public.episodes ep
    SET desc_chunk_status='done'
    FROM cte
    WHERE ep.id = cte.episode_id
      AND ep.desc_chunk_status IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_desc_chunk_status_pending(_limit int DEFAULT 5000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  WITH cte AS (
    SELECT id FROM public.episodes
    WHERE desc_chunk_status IS NULL
      AND description IS NOT NULL
      AND length(description) > 1600
    LIMIT _limit
  ), upd AS (
    UPDATE public.episodes ep
    SET desc_chunk_status='pending'
    FROM cte
    WHERE ep.id = cte.id
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_desc_chunk_status_skipped(_limit int DEFAULT 5000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  WITH cte AS (
    SELECT id FROM public.episodes
    WHERE desc_chunk_status IS NULL
    LIMIT _limit
  ), upd AS (
    UPDATE public.episodes ep
    SET desc_chunk_status='skipped'
    FROM cte
    WHERE ep.id = cte.id
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$$;
