DROP MATERIALIZED VIEW IF EXISTS public.mv_homepage_feed CASCADE;

CREATE MATERIALIZED VIEW public.mv_homepage_feed AS
WITH eligible AS (
  SELECT p.id, p.slug, p.title, p.display_title, p.image_url, p.category,
         p.podiverzum_rank, p.rank_label, p.rss_status, p.featured, p.featured_rank
  FROM podcasts p
  WHERE (p.featured OR p.rank_label = ANY (ARRAY['S','A']))
    AND p.rss_status <> ALL (ARRAY['failed','inactive'])
    AND COALESCE(p.shadow_rank_components ->> 'health_state', 'healthy')
        = ANY (ARRAY['healthy','recovered_rss_url'])
    AND (p.language IS NULL OR p.language ILIKE 'en%')
)
SELECT
  e.id AS episode_id,
  e.title,
  e.display_title,
  e.slug,
  e.summary,
  e.description,
  e.ai_summary,
  e.published_at,
  e.audio_url,
  e.topics,
  el.id AS podcast_id,
  el.slug AS podcast_slug,
  el.title AS podcast_title,
  el.display_title AS podcast_display_title,
  el.image_url AS podcast_image_url,
  el.category AS podcast_category,
  el.podiverzum_rank,
  el.rank_label,
  el.rss_status,
  el.featured,
  el.featured_rank,
  CASE
    WHEN e.published_at >= now() - interval '72 hours' THEN 'hot'
    WHEN e.published_at >= now() - interval '14 days'  THEN 'fresh'
    ELSE 'recent'
  END AS freshness_bucket,
  row_number() OVER (PARTITION BY el.id ORDER BY e.published_at DESC NULLS LAST) AS pod_rank
FROM eligible el
CROSS JOIN LATERAL (
  SELECT ep.*
  FROM episodes ep
  WHERE ep.podcast_id = el.id
    AND ep.published_at IS NOT NULL
    AND ep.published_at >= now() - interval '30 days'
    AND ep.title IS NOT NULL
  ORDER BY ep.published_at DESC
  LIMIT 8
) e;

CREATE UNIQUE INDEX mv_homepage_feed_episode_pkey ON public.mv_homepage_feed (episode_id);
CREATE INDEX mv_homepage_feed_pub_idx          ON public.mv_homepage_feed (published_at DESC NULLS LAST);
CREATE INDEX mv_homepage_feed_bucket_idx       ON public.mv_homepage_feed (freshness_bucket, published_at DESC NULLS LAST);
CREATE INDEX mv_homepage_feed_category_pub_idx ON public.mv_homepage_feed (podcast_category, published_at DESC NULLS LAST);
CREATE INDEX mv_homepage_feed_pod_idx          ON public.mv_homepage_feed (podcast_id, pod_rank);

REFRESH MATERIALIZED VIEW public.mv_homepage_feed;