CREATE OR REPLACE FUNCTION public.match_episodes_by_embedding(
  query_embedding vector(768),
  match_limit integer DEFAULT 12,
  max_age_days integer DEFAULT 30
)
RETURNS TABLE (
  episode_id uuid,
  podcast_id uuid,
  similarity double precision,
  title text,
  display_title text,
  published_at timestamptz,
  podcast_slug text,
  podcast_title text,
  podcast_display_title text,
  podcast_image_url text,
  podcast_category text,
  rank_label text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.podcast_id,
    1 - (ee.embedding <=> query_embedding) AS similarity,
    e.title,
    e.display_title,
    e.published_at,
    p.slug,
    p.title,
    p.display_title,
    p.image_url,
    p.category,
    p.rank_label
  FROM episode_embeddings ee
  JOIN episodes e ON e.id = ee.episode_id
  JOIN podcasts p ON p.id = e.podcast_id
  WHERE e.published_at >= now() - (max_age_days || ' days')::interval
    AND p.rank_label IN ('S','A','B')
    AND p.rss_status NOT IN ('failed','inactive')
    AND (p.language IS NULL OR p.language ILIKE 'en%')
  ORDER BY ee.embedding <=> query_embedding
  LIMIT match_limit;
$$;