-- Podcast charts for podiverzum.com.
-- Stores daily chart snapshots and exposes a transparent reciprocal-rank toplist.

CREATE TABLE IF NOT EXISTS public.podcast_charts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('apple','spotify','youtube')),
  country text NOT NULL DEFAULT 'us',
  rank int NOT NULL,
  podcast_id uuid NULL REFERENCES public.podcasts(id) ON DELETE SET NULL,
  raw_name text NOT NULL,
  raw_artist text NULL,
  raw_external_id text NULL,
  raw_url text NULL,
  image_url text NULL,
  matched_via text NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.podcast_charts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_charts TO authenticated;
GRANT ALL ON public.podcast_charts TO service_role;

ALTER TABLE public.podcast_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "charts public read" ON public.podcast_charts;
CREATE POLICY "charts public read" ON public.podcast_charts FOR SELECT USING (true);

DROP POLICY IF EXISTS "charts admin write" ON public.podcast_charts;
CREATE POLICY "charts admin write" ON public.podcast_charts FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_podcast_charts_snapshot
  ON public.podcast_charts (source, country, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_charts_podcast
  ON public.podcast_charts (podcast_id) WHERE podcast_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.youtube_channel_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id text NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  subscriber_count bigint NULL,
  view_count bigint NULL,
  video_count int NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.youtube_channel_stats TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.youtube_channel_stats TO authenticated;
GRANT ALL ON public.youtube_channel_stats TO service_role;

ALTER TABLE public.youtube_channel_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "yt_stats public read" ON public.youtube_channel_stats;
CREATE POLICY "yt_stats public read" ON public.youtube_channel_stats FOR SELECT USING (true);

DROP POLICY IF EXISTS "yt_stats admin write" ON public.youtube_channel_stats;
CREATE POLICY "yt_stats admin write" ON public.youtube_channel_stats FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_yt_stats_channel_time
  ON public.youtube_channel_stats (channel_id, snapshot_at DESC);

CREATE OR REPLACE FUNCTION public.get_trending_podcasts(
  p_limit int DEFAULT 12,
  p_country text DEFAULT 'us'
)
RETURNS TABLE (
  id uuid,
  title text,
  display_title text,
  slug text,
  summary text,
  description text,
  image_url text,
  category text,
  apple_url text,
  spotify_url text,
  youtube_url text,
  website_url text,
  podiverzum_rank numeric,
  rank_label text,
  trending_score numeric,
  source_count int,
  best_rank int,
  sources jsonb,
  snapshot_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest_snap AS (
    SELECT source, max(snapshot_at) AS snap
    FROM public.podcast_charts
    WHERE country = lower(p_country)
      AND snapshot_at > now() - interval '10 days'
    GROUP BY source
  ),
  current_charts AS (
    SELECT c.*
    FROM public.podcast_charts c
    JOIN latest_snap ls ON ls.source = c.source AND ls.snap = c.snapshot_at
    WHERE c.podcast_id IS NOT NULL
  ),
  scored AS (
    SELECT
      podcast_id,
      sum(1.0 / rank)::numeric AS trending_score,
      count(DISTINCT source)::int AS source_count,
      min(rank)::int AS best_rank,
      jsonb_agg(jsonb_build_object('source', source, 'rank', rank) ORDER BY source, rank) AS sources,
      max(snapshot_at) AS snapshot_at
    FROM current_charts
    GROUP BY podcast_id
  )
  SELECT
    p.id, p.title, p.display_title, p.slug, p.summary, p.description,
    p.image_url, p.category, p.apple_url, p.spotify_url, p.youtube_url, p.website_url,
    p.podiverzum_rank, p.rank_label,
    s.trending_score, s.source_count, s.best_rank, s.sources, s.snapshot_at
  FROM scored s
  JOIN public.podcasts p ON p.id = s.podcast_id
  WHERE (p.language ILIKE 'en%' OR p.language IS NULL)
    AND coalesce(p.rss_status, '') NOT IN ('failed','inactive')
    AND coalesce(p.rank_label, 'E') NOT IN ('D','E')
  ORDER BY s.trending_score DESC, s.source_count DESC, p.podiverzum_rank DESC NULLS LAST
  LIMIT greatest(1, least(p_limit, 500));
$$;

GRANT EXECUTE ON FUNCTION public.get_trending_podcasts(int, text) TO anon, authenticated, service_role;
