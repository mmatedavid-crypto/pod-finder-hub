CREATE OR REPLACE FUNCTION public.similar_episodes(p_episode_id uuid, p_limit integer DEFAULT 6)
RETURNS TABLE(episode_id uuid, podcast_id uuid, similarity double precision, title text, display_title text, slug text, ai_summary text, summary text, description text, published_at timestamp with time zone, audio_url text, topics text[], podcast_slug text, podcast_title text, podcast_display_title text, podcast_image_url text, podcast_category text, podiverzum_rank numeric, rank_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '2500ms'
AS $function$
DECLARE
  src_embedding vector(768);
  src_podcast_id uuid;
  c jsonb;
  c_at timestamptz;
  lim int := LEAST(GREATEST(COALESCE(p_limit, 1), 1), 8); -- NULL limit maps to 1; hard bound: 8 candidates max
  got_slot boolean := false;
  i int;
BEGIN
  -- Source podcast from the source embedding (original association: p.id = ee.podcast_id).
  SELECT ee.podcast_id INTO src_podcast_id FROM episode_embeddings ee
  WHERE ee.episode_id = p_episode_id LIMIT 1;

  SELECT rc.candidates, rc.computed_at INTO c, c_at
  FROM recommendation_cache rc
  WHERE rc.kind = 'episode' AND rc.source_id = p_episode_id;

  -- Fresh: non-empty for 72h; empty (no vector / no candidates) for 1h.
  IF c IS NOT NULL AND (
       (jsonb_array_length(c) > 0 AND c_at > now() - interval '72 hours') OR
       (jsonb_array_length(c) = 0 AND c_at > now() - interval '1 hour')) THEN
    RETURN QUERY
    SELECT e.id, e.podcast_id, (cand->>'score')::float,
      e.title, e.display_title, e.slug,
      e.ai_summary, e.summary, e.description,
      e.published_at, e.audio_url, e.topics,
      p.slug, p.title, p.display_title,
      p.image_url, p.category, p.podiverzum_rank, p.rank_label
    FROM jsonb_array_elements(c) WITH ORDINALITY AS t(cand, ord)
    JOIN episodes e ON e.id = (cand->>'id')::uuid
    JOIN podcasts p ON p.id = e.podcast_id
    WHERE e.id <> p_episode_id
      AND e.podcast_id <> COALESCE(src_podcast_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND p.rss_status NOT IN ('failed','inactive')
      AND COALESCE(p.rank_label,'E') NOT IN ('D','E')
    ORDER BY t.ord
    LIMIT lim;
    RETURN;
  END IF;

  -- Nonexistent source: return empty WITHOUT caching and BEFORE taking any lock.
  PERFORM 1 FROM episodes e WHERE e.id = p_episode_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Per-source nonblocking lock FIRST, then one of two shared global permits.
  IF NOT pg_try_advisory_xact_lock(hashtext('episode:' || p_episode_id::text)) THEN
    IF c IS NOT NULL AND jsonb_array_length(c) > 0 AND c_at > now() - interval '7 days' THEN
      RETURN QUERY
      SELECT e.id, e.podcast_id, (cand->>'score')::float,
        e.title, e.display_title, e.slug,
        e.ai_summary, e.summary, e.description,
        e.published_at, e.audio_url, e.topics,
        p.slug, p.title, p.display_title,
        p.image_url, p.category, p.podiverzum_rank, p.rank_label
      FROM jsonb_array_elements(c) WITH ORDINALITY AS t(cand, ord)
      JOIN episodes e ON e.id = (cand->>'id')::uuid
      JOIN podcasts p ON p.id = e.podcast_id
      WHERE e.id <> p_episode_id
        AND e.podcast_id <> COALESCE(src_podcast_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND p.rss_status NOT IN ('failed','inactive')
        AND COALESCE(p.rank_label,'E') NOT IN ('D','E')
      ORDER BY t.ord
      LIMIT lim;
      RETURN;
    END IF;
    RAISE EXCEPTION 'recommendations_busy';
  END IF;

  FOR i IN 0..1 LOOP
    IF pg_try_advisory_xact_lock(920000 + i) THEN got_slot := true; EXIT; END IF;
  END LOOP;
  IF NOT got_slot THEN
    IF c IS NOT NULL AND jsonb_array_length(c) > 0 AND c_at > now() - interval '7 days' THEN
      RETURN QUERY
      SELECT e.id, e.podcast_id, (cand->>'score')::float,
        e.title, e.display_title, e.slug,
        e.ai_summary, e.summary, e.description,
        e.published_at, e.audio_url, e.topics,
        p.slug, p.title, p.display_title,
        p.image_url, p.category, p.podiverzum_rank, p.rank_label
      FROM jsonb_array_elements(c) WITH ORDINALITY AS t(cand, ord)
      JOIN episodes e ON e.id = (cand->>'id')::uuid
      JOIN podcasts p ON p.id = e.podcast_id
      WHERE e.id <> p_episode_id
        AND e.podcast_id <> COALESCE(src_podcast_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND p.rss_status NOT IN ('failed','inactive')
        AND COALESCE(p.rank_label,'E') NOT IN ('D','E')
      ORDER BY t.ord
      LIMIT lim;
      RETURN;
    END IF;
    -- Cold and busy: distinct transient outcome, client retries once.
    RAISE EXCEPTION 'recommendations_busy';
  END IF;

  -- Re-check after locking; honors real empty arrays with the same 1h negative TTL.
  SELECT rc.candidates, rc.computed_at INTO c, c_at
  FROM recommendation_cache rc
  WHERE rc.kind = 'episode' AND rc.source_id = p_episode_id;
  IF c IS NOT NULL AND (
       (jsonb_array_length(c) > 0 AND c_at > now() - interval '72 hours') OR
       (jsonb_array_length(c) = 0 AND c_at > now() - interval '1 hour')) THEN
    RETURN QUERY
    SELECT e.id, e.podcast_id, (cand->>'score')::float,
      e.title, e.display_title, e.slug,
      e.ai_summary, e.summary, e.description,
      e.published_at, e.audio_url, e.topics,
      p.slug, p.title, p.display_title,
      p.image_url, p.category, p.podiverzum_rank, p.rank_label
    FROM jsonb_array_elements(c) WITH ORDINALITY AS t(cand, ord)
    JOIN episodes e ON e.id = (cand->>'id')::uuid
    JOIN podcasts p ON p.id = e.podcast_id
    WHERE e.id <> p_episode_id
      AND e.podcast_id <> COALESCE(src_podcast_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND p.rss_status NOT IN ('failed','inactive')
      AND COALESCE(p.rank_label,'E') NOT IN ('D','E')
    ORDER BY t.ord
    LIMIT lim;
    RETURN;
  END IF;

  SELECT ee.embedding INTO src_embedding FROM episode_embeddings ee
  WHERE ee.episode_id = p_episode_id LIMIT 1;
  IF src_embedding IS NULL THEN
    INSERT INTO recommendation_cache (kind, source_id, candidates)
    VALUES ('episode', p_episode_id, '[]')
    ON CONFLICT (kind, source_id)
    DO UPDATE SET candidates = '[]', computed_at = now();
    RETURN;
  END IF;

  -- Bounded cold compute: ANN prefilter forces index usage (ORDER BY distance LIMIT 48),
  -- eligibility filters applied after; no window function (it defeated the ANN index).
  -- Different-podcast exclusion kept inside the prefilter on ee.podcast_id.
  WITH near AS (
    SELECT ee.episode_id AS cid, (ee.embedding <=> src_embedding) AS dist
    FROM episode_embeddings ee
    WHERE ee.episode_id <> p_episode_id
      AND ee.podcast_id <> COALESCE(src_podcast_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY ee.embedding <=> src_embedding
    LIMIT 48
  )
  SELECT jsonb_agg(jsonb_build_object('id', n.cid, 'score', (1 - n.dist)::float) ORDER BY n.dist) INTO c
  FROM near n
  JOIN episodes e ON e.id = n.cid
  JOIN podcasts p ON p.id = e.podcast_id
  WHERE p.rss_status NOT IN ('failed','inactive')
    AND COALESCE(p.rank_label,'E') NOT IN ('D','E');

  INSERT INTO recommendation_cache (kind, source_id, candidates)
  VALUES ('episode', p_episode_id, COALESCE(c, '[]'))
  ON CONFLICT (kind, source_id)
  DO UPDATE SET candidates = EXCLUDED.candidates, computed_at = now();

  RETURN QUERY
  SELECT e.id, e.podcast_id, (cand->>'score')::float,
    e.title, e.display_title, e.slug,
    e.ai_summary, e.summary, e.description,
    e.published_at, e.audio_url, e.topics,
    p.slug, p.title, p.display_title,
    p.image_url, p.category, p.podiverzum_rank, p.rank_label
  FROM jsonb_array_elements(COALESCE(c, '[]')) WITH ORDINALITY AS t(cand, ord)
  JOIN episodes e ON e.id = (cand->>'id')::uuid
  JOIN podcasts p ON p.id = e.podcast_id
  WHERE e.id <> p_episode_id
    AND e.podcast_id <> COALESCE(src_podcast_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND p.rss_status NOT IN ('failed','inactive')
    AND COALESCE(p.rank_label,'E') NOT IN ('D','E')
  ORDER BY t.ord
  LIMIT lim;
END;
$function$;