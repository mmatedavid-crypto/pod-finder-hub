CREATE TABLE IF NOT EXISTS public.sitemap_month_cache (
  ym text PRIMARY KEY,
  n bigint NOT NULL,
  max_updated_at timestamptz,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sitemap_month_cache TO service_role;
ALTER TABLE public.sitemap_month_cache ENABLE ROW LEVEL SECURITY;

-- Bounded refresh: function-local timeout only; on any error the previous
-- (last-good) rows are kept because the whole function rolls back.
CREATE OR REPLACE FUNCTION public.refresh_sitemap_month_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '300s'
AS $$
DECLARE _n integer;
BEGIN
  CREATE TEMP TABLE _smc ON COMMIT DROP AS
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
  GROUP BY 1;
  SELECT count(*) INTO _n FROM _smc;
  IF _n = 0 THEN
    RAISE EXCEPTION 'sitemap refresh produced 0 months; keeping last-good cache';
  END IF;
  DELETE FROM sitemap_month_cache WHERE ym NOT IN (SELECT ym FROM _smc);
  INSERT INTO sitemap_month_cache (ym, n, max_updated_at, refreshed_at)
  SELECT ym, n, max_updated_at, now() FROM _smc
  ON CONFLICT (ym) DO UPDATE SET n = EXCLUDED.n, max_updated_at = EXCLUDED.max_updated_at, refreshed_at = EXCLUDED.refreshed_at;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.refresh_sitemap_month_cache() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_sitemap_month_cache() TO service_role;

-- Same signature/output as before, now a cheap read of the cache.
CREATE OR REPLACE FUNCTION public.sitemap_episode_month_counts()
RETURNS TABLE(ym text, n bigint, max_updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.ym, c.n, c.max_updated_at FROM sitemap_month_cache c WHERE c.n > 0 ORDER BY c.ym;
$$;