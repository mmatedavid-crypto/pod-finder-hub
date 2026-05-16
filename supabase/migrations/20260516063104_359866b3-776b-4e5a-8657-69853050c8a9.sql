
-- 1) Scout candidate RPC: skip "dead-publisher" podcasts (≥20 attempted episodes, 0 found),
--    and cluster results by podcast_id so the runner can reuse a single RSS fetch per feed.
CREATE OR REPLACE FUNCTION public.select_transcript_scout_candidates(_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid, podcast_id uuid, rss_url text, guid text, episode_url text,
  audio_url text, youtube_url text, podcast_rss_url text, shadow_rank_tier text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH pod_stats AS (
    SELECT
      et.podcast_id,
      COUNT(*) FILTER (WHERE et.status IN ('not_available','failed','found')) AS attempts,
      COUNT(*) FILTER (WHERE et.status = 'found') AS found_count
    FROM episode_transcripts et
    GROUP BY et.podcast_id
  ),
  dead AS (
    SELECT podcast_id FROM pod_stats
    WHERE attempts >= 20 AND found_count = 0
  )
  SELECT
    e.id, e.podcast_id, NULL::text AS rss_url,
    e.guid, e.episode_url, e.audio_url, e.youtube_url,
    p.rss_url AS podcast_rss_url,
    p.shadow_rank_tier
  FROM episodes e
  JOIN podcasts p ON p.id = e.podcast_id
  WHERE p.shadow_rank_tier IN ('S','A')
    AND (p.language IS NULL OR p.language ILIKE 'en%')
    AND (e.transcript_status IS NULL OR e.transcript_status = 'unchecked'
         OR (e.transcript_status = 'failed' AND (e.next_transcript_check_at IS NULL OR e.next_transcript_check_at < now())))
    AND NOT EXISTS (SELECT 1 FROM dead d WHERE d.podcast_id = e.podcast_id)
  ORDER BY
    CASE p.shadow_rank_tier WHEN 'S' THEN 1 ELSE 2 END,
    e.podcast_id,                  -- cluster by podcast so runner can reuse RSS fetch
    e.published_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(1000, _limit));
$$;
