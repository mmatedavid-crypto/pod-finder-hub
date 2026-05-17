
CREATE OR REPLACE FUNCTION public.transcript_roi_report(_hours int DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(hours => _hours);
  v_chunks bigint;
  v_episodes bigint;
  v_chars bigint;
  v_avg_chars numeric;
  v_tokens numeric;
  v_cost_per_1k numeric := 0.000025; -- gemini-embedding-001 estimate
  v_total_cost numeric;
  v_source_counts jsonb;
  v_source_counts_24h jsonb;
  v_pending_episodes bigint;
  v_dup_chunks bigint;
  v_top_episodes jsonb;
  v_top_podcasts jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT count(*), count(DISTINCT episode_id), coalesce(sum(length(text)),0), coalesce(avg(length(text)),0)
    INTO v_chunks, v_episodes, v_chars, v_avg_chars
  FROM episode_chunks
  WHERE source = 'transcript_rss' AND updated_at >= v_since;

  v_tokens := v_chars / 4.0;
  v_total_cost := (v_tokens / 1000.0) * v_cost_per_1k;

  -- source breakdown all-time
  SELECT jsonb_object_agg(source, c) INTO v_source_counts
  FROM (SELECT source, count(*) c FROM episode_chunks GROUP BY source) s;

  -- source breakdown 24h
  SELECT jsonb_object_agg(source, c) INTO v_source_counts_24h
  FROM (SELECT source, count(*) c FROM episode_chunks WHERE updated_at >= v_since GROUP BY source) s;

  -- episodes with chunks_status pending but no chunks (queued but not yet embedded)
  SELECT count(*) INTO v_pending_episodes
  FROM episodes e
  WHERE e.chunks_status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM episode_chunks c WHERE c.episode_id = e.id);

  -- duplicates: same (episode_id, chunk_idx, source) appearing more than once
  SELECT coalesce(sum(c - 1), 0) INTO v_dup_chunks
  FROM (
    SELECT episode_id, chunk_idx, source, count(*) c
    FROM episode_chunks
    WHERE source = 'transcript_rss'
    GROUP BY 1,2,3
    HAVING count(*) > 1
  ) d;

  -- top 50 episodes by chunk count (transcript_rss)
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_episodes FROM (
    SELECT e.id, e.title, e.podcast_id, p.title AS podcast_title, p.slug AS podcast_slug,
           e.slug AS episode_slug, x.c AS chunk_count,
           round((x.c::numeric * 800 / 4.0 / 1000.0) * v_cost_per_1k, 6) AS est_cost_usd
    FROM (
      SELECT episode_id, count(*) c
      FROM episode_chunks
      WHERE source = 'transcript_rss'
      GROUP BY episode_id
      ORDER BY c DESC
      LIMIT 50
    ) x
    JOIN episodes e ON e.id = x.episode_id
    LEFT JOIN podcasts p ON p.id = e.podcast_id
    ORDER BY x.c DESC
  ) t;

  -- top 50 podcasts by total transcript chunk count / cost
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_podcasts FROM (
    SELECT p.id, p.title, p.slug, x.chunks, x.episodes,
           round((x.chars::numeric / 4.0 / 1000.0) * v_cost_per_1k, 4) AS est_cost_usd
    FROM (
      SELECT c.podcast_id,
             count(*) AS chunks,
             count(DISTINCT c.episode_id) AS episodes,
             sum(length(c.text)) AS chars
      FROM episode_chunks c
      WHERE c.source = 'transcript_rss'
      GROUP BY c.podcast_id
      ORDER BY sum(length(c.text)) DESC
      LIMIT 50
    ) x
    LEFT JOIN podcasts p ON p.id = x.podcast_id
    ORDER BY x.chars DESC
  ) t;

  RETURN jsonb_build_object(
    'window_hours', _hours,
    'since', v_since,
    'cost_per_1k_tokens_usd', v_cost_per_1k,
    'transcript_24h', jsonb_build_object(
      'chunks_created', v_chunks,
      'chunks_embedded', v_chunks,
      'episodes_embedded', v_episodes,
      'avg_chunks_per_episode', CASE WHEN v_episodes > 0 THEN round(v_chunks::numeric / v_episodes, 2) ELSE 0 END,
      'avg_chars_per_chunk', round(v_avg_chars, 1),
      'avg_tokens_per_chunk', round(v_avg_chars / 4.0, 1),
      'total_chars', v_chars,
      'total_tokens_est', round(v_tokens, 0),
      'total_cost_usd', round(v_total_cost, 4),
      'cost_per_chunk_usd', CASE WHEN v_chunks > 0 THEN round(v_total_cost / v_chunks, 8) ELSE 0 END,
      'cost_per_episode_usd', CASE WHEN v_episodes > 0 THEN round(v_total_cost / v_episodes, 6) ELSE 0 END
    ),
    'pending_episodes_no_chunks', v_pending_episodes,
    'duplicate_chunks', v_dup_chunks,
    'source_breakdown_all', coalesce(v_source_counts, '{}'::jsonb),
    'source_breakdown_24h', coalesce(v_source_counts_24h, '{}'::jsonb),
    'top_episodes', v_top_episodes,
    'top_podcasts', v_top_podcasts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transcript_roi_report(int) TO authenticated;
