
-- GIN index for fast `people @> ARRAY[...]` lookups
CREATE INDEX IF NOT EXISTS idx_episodes_people_gin ON public.episodes USING GIN (people);

-- Slug helper (uses unaccent)
CREATE OR REPLACE FUNCTION public.person_slugify(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(both '-' FROM regexp_replace(lower(public.unaccent(coalesce(p,''))), '[^a-z0-9]+', '-', 'g'))
$$;

-- New person candidates from extracted episode entities
CREATE OR REPLACE FUNCTION public.select_person_candidates(
  _min_count int DEFAULT 3,
  _min_pods int DEFAULT 2,
  _limit int DEFAULT 50
)
RETURNS TABLE(display_name text, slug text, cnt int, pods int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH x AS (
    SELECT unnest(people) AS p, podcast_id
    FROM episodes
    WHERE array_length(people, 1) > 0
  ),
  agg AS (
    SELECT p,
           count(*)::int AS cnt,
           count(DISTINCT podcast_id)::int AS pods
    FROM x
    GROUP BY p
    HAVING count(*) >= _min_count
       AND count(DISTINCT podcast_id) >= _min_pods
  )
  SELECT p AS display_name,
         public.person_slugify(p) AS slug,
         cnt,
         pods
  FROM agg
  WHERE length(p) BETWEEN 3 AND 80
    AND public.person_slugify(p) <> ''
    AND length(public.person_slugify(p)) >= 3
    AND public.person_slugify(p) NOT IN (
      SELECT slug FROM entity_profiles WHERE kind = 'person'
    )
  ORDER BY cnt DESC
  LIMIT _limit
$$;

-- Existing person profiles with new episodes since last generation
CREATE OR REPLACE FUNCTION public.select_person_refresh_candidates(_limit int DEFAULT 30)
RETURNS TABLE(slug text, display_name text, new_eps int, generated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.slug,
    p.display_name,
    (
      SELECT count(*)::int FROM episodes e
      WHERE e.people @> ARRAY[p.display_name]
        AND e.published_at > p.generated_at
        AND NOT (e.id = ANY (coalesce(p.episode_ids, '{}'::uuid[])))
    ) AS new_eps,
    p.generated_at
  FROM entity_profiles p
  WHERE p.kind = 'person'
    AND EXISTS (
      SELECT 1 FROM episodes e
      WHERE e.people @> ARRAY[p.display_name]
        AND e.published_at > p.generated_at
        AND NOT (e.id = ANY (coalesce(p.episode_ids, '{}'::uuid[])))
    )
  ORDER BY new_eps DESC NULLS LAST, p.generated_at ASC
  LIMIT _limit
$$;
