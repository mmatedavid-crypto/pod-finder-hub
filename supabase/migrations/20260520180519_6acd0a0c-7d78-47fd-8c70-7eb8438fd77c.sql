CREATE OR REPLACE FUNCTION public.sitemap_episode_month_counts()
RETURNS TABLE(ym text, n bigint, max_updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT to_char(date_trunc('month', e.published_at), 'YYYY-MM') AS ym,
         count(*)::bigint AS n,
         max(coalesce(e.updated_at, e.ai_enriched_at, e.published_at)) AS max_updated_at
  FROM episodes e
  JOIN podcasts p ON p.id = e.podcast_id
  WHERE e.published_at IS NOT NULL
    AND e.published_at >= date '2024-01-01'
    AND e.published_at < (now() + interval '1 day')
    AND (p.language IS NULL OR p.language ILIKE 'en%')
    AND p.rss_status IS DISTINCT FROM 'failed'
    AND p.rss_status IS DISTINCT FROM 'inactive'
  GROUP BY 1
  HAVING count(*) > 0
  ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION public.sitemap_episode_month_counts() TO anon, authenticated, service_role;