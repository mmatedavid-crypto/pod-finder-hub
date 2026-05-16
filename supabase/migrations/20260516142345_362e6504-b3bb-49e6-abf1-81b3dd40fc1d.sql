
-- Company discovery: mirrors select_person_candidates
CREATE OR REPLACE FUNCTION public.select_company_candidates(
  _min_count integer DEFAULT 3,
  _min_pods integer DEFAULT 2,
  _limit integer DEFAULT 50
)
RETURNS TABLE(display_name text, slug text, cnt integer, pods integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH x AS (
    SELECT unnest(e.companies) AS c, e.podcast_id
    FROM episodes e
    JOIN podcasts p ON p.id = e.podcast_id
    WHERE array_length(e.companies, 1) > 0
      AND (p.language IS NULL OR p.language ILIKE 'en%')
      AND p.rss_status NOT IN ('failed', 'inactive')
  ),
  agg AS (
    SELECT c,
           count(*)::int AS cnt,
           count(DISTINCT podcast_id)::int AS pods
    FROM x
    GROUP BY c
    HAVING count(*) >= _min_count
       AND count(DISTINCT podcast_id) >= _min_pods
  )
  SELECT c AS display_name,
         public.person_slugify(c) AS slug,
         cnt,
         pods
  FROM agg
  WHERE length(c) BETWEEN 2 AND 80
    AND public.person_slugify(c) <> ''
    AND length(public.person_slugify(c)) >= 2
    AND public.person_slugify(c) NOT IN (
      SELECT slug FROM entity_profiles WHERE kind = 'company'
    )
  ORDER BY cnt DESC
  LIMIT _limit
$function$;

-- Company refresh: mirrors select_person_refresh_candidates
CREATE OR REPLACE FUNCTION public.select_company_refresh_candidates(_limit integer DEFAULT 30)
RETURNS TABLE(slug text, display_name text, new_eps integer, generated_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p.slug,
    p.display_name,
    (
      SELECT count(*)::int FROM episodes e
      WHERE e.companies @> ARRAY[p.display_name]
        AND e.published_at > p.generated_at
        AND NOT (e.id = ANY (coalesce(p.episode_ids, '{}'::uuid[])))
    ) AS new_eps,
    p.generated_at
  FROM entity_profiles p
  WHERE p.kind = 'company'
    AND EXISTS (
      SELECT 1 FROM episodes e
      WHERE e.companies @> ARRAY[p.display_name]
        AND e.published_at > p.generated_at
        AND NOT (e.id = ANY (coalesce(p.episode_ids, '{}'::uuid[])))
    )
  ORDER BY new_eps DESC NULLS LAST, p.generated_at ASC
  LIMIT _limit
$function$;
