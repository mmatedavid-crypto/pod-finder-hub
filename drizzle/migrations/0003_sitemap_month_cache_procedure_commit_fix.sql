-- A SET clause on a procedure forbids COMMIT; schema-qualify everything instead.
CREATE OR REPLACE PROCEDURE public.refresh_sitemap_month_cache_proc(p_budget_seconds integer DEFAULT 45)
LANGUAGE plpgsql
AS $$
DECLARE
  _t0 timestamptz := clock_timestamp();
  _m date;
  _cnt bigint;
  _max timestamptz;
  _prev date := date_trunc('month', now() - interval '1 month')::date;
BEGIN
  LOOP
    EXIT WHEN clock_timestamp() - _t0 > make_interval(secs => p_budget_seconds);
    _m := NULL;
    SELECT months.m INTO _m
    FROM (SELECT generate_series(date '2024-01-01', date_trunc('month', now())::date, interval '1 month')::date AS m) months
    LEFT JOIN public.sitemap_month_cache c ON c.ym = to_char(months.m, 'YYYY-MM')
    WHERE c.ym IS NULL
       OR (months.m >= _prev AND c.refreshed_at < now() - interval '50 minutes')
       OR c.refreshed_at < now() - interval '7 days'
    ORDER BY (c.ym IS NULL) DESC, (months.m >= _prev) DESC, c.refreshed_at NULLS FIRST, months.m DESC
    LIMIT 1;
    EXIT WHEN _m IS NULL;
    SELECT count(*), max(coalesce(e.updated_at, e.ai_enriched_at, e.published_at))
      INTO _cnt, _max
    FROM public.episodes e
    JOIN public.podcasts p ON p.id = e.podcast_id
    WHERE e.published_at >= _m
      AND e.published_at < (_m + interval '1 month')
      AND e.published_at < (now() + interval '1 day')
      AND (p.language IS NULL OR p.language ILIKE 'en%')
      AND p.rss_status IS DISTINCT FROM 'failed'
      AND p.rss_status IS DISTINCT FROM 'inactive';
    INSERT INTO public.sitemap_month_cache (ym, n, max_updated_at, refreshed_at)
    VALUES (to_char(_m, 'YYYY-MM'), _cnt, _max, now())
    ON CONFLICT (ym) DO UPDATE SET n = EXCLUDED.n, max_updated_at = EXCLUDED.max_updated_at, refreshed_at = EXCLUDED.refreshed_at;
    COMMIT;
  END LOOP;
END $$;
REVOKE ALL ON PROCEDURE public.refresh_sitemap_month_cache_proc(integer) FROM PUBLIC, anon, authenticated;