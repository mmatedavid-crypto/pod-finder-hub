ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS known_hosts text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_podcasts_known_hosts_gin
  ON public.podcasts USING GIN (known_hosts);

CREATE OR REPLACE FUNCTION public.entity_extract_enqueue(_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inserted integer;
BEGIN
  WITH cand AS (
    SELECT
      e.id,
      CASE p.rank_label WHEN 'S' THEN 100 WHEN 'A' THEN 80 WHEN 'B' THEN 60 ELSE 40 END AS pr,
      CASE
        WHEN COALESCE(cardinality(p.known_hosts), 0) > 0
          THEN md5('entity_v3:' || e.id::text)
        ELSE md5('entity_v2:' || e.id::text)
      END AS h
    FROM public.episodes e
    JOIN public.podcasts p ON p.id = e.podcast_id
    WHERE p.rank_label IN ('S','A')
      AND (p.language IS NULL OR p.language ILIKE 'en%')
      AND (
        COALESCE(e.ai_entities_version, 0) < 2
        OR (COALESCE(cardinality(p.known_hosts), 0) > 0 AND COALESCE(e.ai_entities_version, 0) < 3)
      )
      AND (e.ai_summary IS NOT NULL OR e.summary IS NOT NULL OR e.description IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.ai_enrichment_jobs j
         WHERE j.kind = 'entity_episode'
           AND j.target_type = 'episode'
           AND j.target_id = e.id
           AND j.input_hash = CASE
             WHEN COALESCE(cardinality(p.known_hosts), 0) > 0
               THEN md5('entity_v3:' || e.id::text)
             ELSE md5('entity_v2:' || e.id::text)
           END
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
END $function$;