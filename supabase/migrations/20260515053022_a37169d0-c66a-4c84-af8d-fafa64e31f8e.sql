-- 1) Add search context columns to episode_events
ALTER TABLE public.episode_events
  ADD COLUMN IF NOT EXISTS search_query text,
  ADD COLUMN IF NOT EXISTS search_rank integer;

CREATE INDEX IF NOT EXISTS idx_episode_events_search_query
  ON public.episode_events (search_query, created_at DESC)
  WHERE search_query IS NOT NULL;

-- 2) NDCG@10 weekly RPC.
-- Binary relevance: a click on rank r contributes 1/log2(r+1).
-- Per-query NDCG = DCG / IDCG; IDCG with k clicks at top positions.
-- Returns top queries by impression count over the last 7 days.
CREATE OR REPLACE FUNCTION public.search_ndcg_weekly(p_min_impressions integer DEFAULT 5)
RETURNS TABLE (
  query text,
  impressions integer,
  clicks integer,
  ctr numeric,
  ndcg10 numeric,
  mrr numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH imp AS (
    SELECT lower(btrim(query)) AS q, count(*)::int AS impressions
    FROM public.search_events
    WHERE created_at >= now() - interval '7 days'
      AND query IS NOT NULL AND length(btrim(query)) >= 2
    GROUP BY 1
    HAVING count(*) >= p_min_impressions
  ),
  clk AS (
    SELECT
      lower(btrim(search_query)) AS q,
      search_rank AS r,
      count(*)::int AS hits
    FROM public.episode_events
    WHERE created_at >= now() - interval '7 days'
      AND search_query IS NOT NULL
      AND search_rank IS NOT NULL
      AND search_rank BETWEEN 1 AND 10
    GROUP BY 1, 2
  ),
  per_query AS (
    SELECT
      i.q,
      i.impressions,
      COALESCE(SUM(c.hits), 0)::int AS clicks,
      COALESCE(SUM(c.hits * (1.0 / log(2, c.r + 1))), 0) AS dcg,
      COALESCE(MAX(1.0 / log(2, c.r + 1)) FILTER (WHERE c.hits > 0), 0) AS best_inv_log
    FROM imp i
    LEFT JOIN clk c ON c.q = i.q
    GROUP BY i.q, i.impressions
  )
  SELECT
    q AS query,
    impressions,
    clicks,
    ROUND((clicks::numeric / NULLIF(impressions, 0)) * 100, 1) AS ctr,
    -- Normalize: ideal DCG when clicks land at rank 1 = 1/log2(2)=1. So NDCG ≈ dcg / ideal.
    -- Ideal DCG with k clicks all at rank 1 = k * 1.0. We approximate IDCG = clicks * 1.0.
    CASE WHEN clicks > 0 THEN ROUND(LEAST(1.0, dcg / clicks)::numeric, 3) ELSE 0 END AS ndcg10,
    -- MRR: best (smallest) rank that received a click → 1/rank
    ROUND(best_inv_log::numeric, 3) AS mrr
  FROM per_query
  ORDER BY impressions DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.search_ndcg_weekly(integer) TO anon, authenticated, service_role;