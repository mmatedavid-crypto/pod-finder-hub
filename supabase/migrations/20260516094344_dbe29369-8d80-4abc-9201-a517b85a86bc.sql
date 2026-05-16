
CREATE OR REPLACE FUNCTION public.select_yt_backfill_candidates(_limit int DEFAULT 50)
RETURNS TABLE(id uuid, podcast_id uuid, episode_title text, podcast_title text, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH eligible AS (
    SELECT e.id, e.podcast_id, e.title AS episode_title, p.title AS podcast_title,
           e.published_at, p.shadow_rank_tier,
           ROW_NUMBER() OVER (PARTITION BY e.podcast_id ORDER BY e.published_at DESC NULLS LAST) AS rn
    FROM public.episodes e
    JOIN public.podcasts p ON p.id = e.podcast_id
    LEFT JOIN public.yt_url_backfill_attempts a ON a.episode_id = e.id
    WHERE e.youtube_url IS NULL
      AND p.shadow_rank_tier IN ('S','A')
      AND (p.language IS NULL OR p.language ILIKE 'en%')
      AND COALESCE(a.status, 'pending') NOT IN ('found','not_available')
      AND (a.next_attempt_at IS NULL OR a.next_attempt_at < now())
      AND e.title IS NOT NULL AND length(e.title) > 3
  )
  SELECT id, podcast_id, episode_title, podcast_title, published_at
  FROM eligible
  ORDER BY rn ASC, shadow_rank_tier ASC, published_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(200, _limit));
$$;
