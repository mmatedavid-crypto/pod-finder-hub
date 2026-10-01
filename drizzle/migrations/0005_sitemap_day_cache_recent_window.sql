-- Hourly refresh only re-counts the last 3 days; older days rotate weekly.
CREATE OR REPLACE PROCEDURE public.refresh_sitemap_month_cache_proc(p_budget_seconds integer DEFAULT 45)
LANGUAGE plpgsql
AS $$
DECLARE
  _t0 timestamptz := clock_timestamp();
  _d date;
  _m date;
  _cnt bigint;
  _max timestamptz;
BEGIN
  LOOP
    EXIT WHEN clock_timestamp() - _t0 > make_interval(secs => p_budget_seconds);
    _d := NULL;
    SELECT days.d INTO _d
    FROM (SELECT generate_series(date '2024-01-01', current_date, interval '1 day')::date AS d) days
    LEFT JOIN public.sitemap_day_cache c ON c.d = days.d
    WHERE c.d IS NULL
       OR (days.d >= current_date - 3 AND c.refreshed_at < now() - interval '50 minutes')
       OR c.refreshed_at < now() - interval '7 days'
    ORDER BY (c.d IS NULL) DESC, (days.d >= current_date - 3) DESC, c.refreshed_at NULLS FIRST, days.d DESC
    LIMIT 1;
    EXIT WHEN _d IS NULL;

    SELECT count(*), max(coalesce(e.updated_at, e.ai_enriched_at, e.published_at))
      INTO _cnt, _max
    FROM public.episodes e
    JOIN public.podcasts p ON p.id = e.podcast_id
    WHERE e.published_at >= _d
      AND e.published_at < _d + 1
      AND e.published_at < (now() + interval '1 day')
      AND (p.language IS NULL OR p.language ILIKE 'en%')
      AND p.rss_status IS DISTINCT FROM 'failed'
      AND p.rss_status IS DISTINCT FROM 'inactive';
    INSERT INTO public.sitemap_day_cache (d, n, max_updated_at, refreshed_at)
    VALUES (_d, _cnt, _max, now())
    ON CONFLICT (d) DO UPDATE SET n = EXCLUDED.n, max_updated_at = EXCLUDED.max_updated_at, refreshed_at = EXCLUDED.refreshed_at;

    _m := date_trunc('month', _d)::date;
    IF (SELECT count(*) FROM public.sitemap_day_cache WHERE d >= _m AND d < (_m + interval '1 month') AND d <= current_date)
       = (LEAST((_m + interval '1 month')::date - 1, current_date) - _m + 1) THEN
      INSERT INTO public.sitemap_month_cache (ym, n, max_updated_at, refreshed_at)
      SELECT to_char(_m, 'YYYY-MM'), sum(n), max(max_updated_at), now()
      FROM public.sitemap_day_cache WHERE d >= _m AND d < (_m + interval '1 month')
      ON CONFLICT (ym) DO UPDATE SET n = EXCLUDED.n, max_updated_at = EXCLUDED.max_updated_at, refreshed_at = EXCLUDED.refreshed_at;
    END IF;
    COMMIT;
  END LOOP;
END $$;
REVOKE ALL ON PROCEDURE public.refresh_sitemap_month_cache_proc(integer) FROM PUBLIC, anon, authenticated;