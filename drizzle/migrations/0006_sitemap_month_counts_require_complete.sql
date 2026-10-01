-- Return nothing until every month since 2024-01 is cached, so the sitemap
-- function answers 503 (no-store) instead of a 200 partial index.
CREATE OR REPLACE FUNCTION public.sitemap_episode_month_counts()
RETURNS TABLE(ym text, n bigint, max_updated_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.ym, c.n, c.max_updated_at FROM sitemap_month_cache c
  WHERE c.n > 0
    AND (SELECT count(*) FROM sitemap_month_cache WHERE ym >= '2024-01')
        >= (SELECT count(*) FROM generate_series(date '2024-01-01', date_trunc('month', now())::date, interval '1 month'))
  ORDER BY c.ym;
$$;