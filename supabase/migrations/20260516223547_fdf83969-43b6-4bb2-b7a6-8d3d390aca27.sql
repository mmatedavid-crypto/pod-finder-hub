
-- 1) Add people_roles JSONB column on episodes (structured role-aware extraction)
ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS people_roles jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_episodes_people_roles_gin
  ON public.episodes USING GIN (people_roles jsonb_path_ops);

-- 2) Refresh enqueue function to support v2 (re-extraction)
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
      md5('entity_v2:' || e.id::text) AS h
    FROM public.episodes e
    JOIN public.podcasts p ON p.id = e.podcast_id
    WHERE p.rank_label IN ('S','A')
      AND (p.language IS NULL OR p.language ILIKE 'en%')
      AND (
        -- Never extracted, OR previous version (<2), OR missing structured people_roles
        COALESCE(e.ai_entities_version, 0) < 2
      )
      AND (e.ai_summary IS NOT NULL OR e.summary IS NOT NULL OR e.description IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.ai_enrichment_jobs j
         WHERE j.kind = 'entity_episode'
           AND j.target_type = 'episode'
           AND j.target_id = e.id
           AND j.input_hash = md5('entity_v2:' || e.id::text)
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

-- 3) Lightweight RPC for the EntityPage to fetch person-role rows (optional convenience).
-- The existing episodes_by_entity already returns SETOF episodes, which now includes people_roles.
