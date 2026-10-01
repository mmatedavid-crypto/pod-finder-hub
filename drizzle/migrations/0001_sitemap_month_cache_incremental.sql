-- Incremental refresh: one month per aggregate (index range on published_at),
-- stale-first, stops after a time budget so every run stays well under the
-- 2-minute job timeout. Failures roll back only that run; last-good rows remain.
CREATE OR REPLACE FUNCTION public.refresh_sitemap_month_cache_step(p_budget_seconds integer DEFAULT 80)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _t0 timestamptz := clock_timestamp();
  _done integer := 0;
  _m date;
  _cnt bigint;
  _max timestamptz;
BEGIN
  FOR _m IN
    WITH months AS (
      SELECT generate_series(date '2024-01-01', date_trunc('month', now())::date, interval '1 month')::date AS m
    )
    SELECT months.m FROM months
    LEFT JOIN sitemap_month_cache c ON c.ym = to_char(months.m, 'YYYY-MM')
    ORDER BY
      (months.m >= date_trunc('month', now() - interval '1 month')::date) DESC, -- current + previous month first
      c.refreshed_at NULLS FIRST,
      months.m DESC
  LOOP
    EXIT WHEN clock_timestamp() - _t0 > make_interval(secs => p_budget_seconds);
    SELECT count(*), max(coalesce(e.updated_at, e.ai_enriched_at, e.published_at))
      INTO _cnt, _max
    FROM episodes e
    JOIN podcasts p ON p.id = e.podcast_id
    WHERE e.published_at >= _m
      AND e.published_at < (_m + interval '1 month')
      AND e.published_at < (now() + interval '1 day')
      AND (p.language IS NULL OR p.language ILIKE 'en%')
      AND p.rss_status IS DISTINCT FROM 'failed'
      AND p.rss_status IS DISTINCT FROM 'inactive';
    INSERT INTO sitemap_month_cache (ym, n, max_updated_at, refreshed_at)
    VALUES (to_char(_m, 'YYYY-MM'), _cnt, _max, now())
    ON CONFLICT (ym) DO UPDATE SET n = EXCLUDED.n, max_updated_at = EXCLUDED.max_updated_at, refreshed_at = EXCLUDED.refreshed_at;
    _done := _done + 1;
  END LOOP;
  RETURN _done;
END $$;
REVOKE ALL ON FUNCTION public.refresh_sitemap_month_cache_step(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_sitemap_month_cache_step(integer) TO service_role;

-- The single full-table version cannot finish within limits; remove it.
DROP FUNCTION IF EXISTS public.refresh_sitemap_month_cache();