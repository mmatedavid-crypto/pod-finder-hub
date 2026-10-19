-- Durable cache for similar_podcasts / similar_episodes recommendations.
-- Stores only ordered candidate IDs + similarity scores (max 8 = the largest
-- client request; SmartDiscoveryPanel full variant). Catalog data is joined at
-- read time and all visibility/rank/status filters are re-applied, so stale
-- metadata or now-ineligible items are never served.
CREATE TABLE public.recommendation_cache (
  kind text NOT NULL,
  source_id uuid NOT NULL,
  candidates jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, source_id)
);
GRANT ALL ON public.recommendation_cache TO service_role;
ALTER TABLE public.recommendation_cache ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: anon/authenticated have no direct access; only the
-- SECURITY DEFINER RPCs below read/write this table.

DROP FUNCTION public.similar_podcasts(uuid, integer);
CREATE FUNCTION public.similar_podcasts(p_podcast_id uuid, p_limit integer DEFAULT 6)
RETURNS TABLE(id uuid, similarity double precision, title text, display_title text, slug text, summary text, description text, image_url text, category text, apple_url text, spotify_url text, youtube_url text, website_url text, featured boolean, rss_status text, podiverzum_rank numeric, rank_label text)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '2500ms'
AS $function$
DECLARE
  src_embedding vector(768);
  c jsonb;
  c_at timestamptz;
  lim int := GREATEST(LEAST(p_limit, 8), 1); -- hard bound: 8 candidates max
  got_slot boolean := false;
  i int;
BEGIN
  SELECT rc.candidates, rc.computed_at INTO c, c_at
  FROM recommendation_cache rc
  WHERE rc.kind = 'podcast' AND rc.source_id = p_podcast_id;

  -- Fresh: non-empty for 72h; empty (no vector / no candidates) for 1h.
  IF c IS NOT NULL AND (
       (jsonb_array_length(c) > 0 AND c_at > now() - interval '72 hours') OR
       (jsonb_array_length(c) = 0 AND c_at > now() - interval '1 hour')) THEN
    RETURN QUERY
    SELECT p.id, (cand->>'score')::float, p.title, p.display_title, p.slug,
      p.summary, p.description, p.image_url, p.category,
      p.apple_url, p.spotify_url, p.youtube_url, p.website_url,
      p.featured, p.rss_status, p.podiverzum_rank, p.rank_label
    FROM jsonb_array_elements(c) WITH ORDINALITY AS t(cand, ord)
    JOIN podcasts p ON p.id = (cand->>'id')::uuid
    WHERE p.rss_status NOT IN ('failed','inactive')
      AND COALESCE(p.rank_label,'E') IN ('S','A','B')
    ORDER BY t.ord
    LIMIT lim;
    RETURN;
  END IF;

  -- Compute needed. Global compute limit: 2 concurrent ANN recomputes across
  -- both RPCs; per-source lock prevents same-key storms. Transaction-scoped
  -- locks are released automatically on timeout/cancel.
  FOR i IN 0..1 LOOP
    IF pg_try_advisory_xact_lock(920000 + i) THEN got_slot := true; EXIT; END IF;
  END LOOP;
  IF NOT got_slot OR NOT pg_try_advisory_xact_lock(hashtext('podcast:' || p_podcast_id::text)) THEN
    IF c IS NOT NULL AND jsonb_array_length(c) > 0 THEN
      -- Serve eligible stale cache while a competing refresh runs.
      RETURN QUERY
      SELECT p.id, (cand->>'score')::float, p.title, p.display_title, p.slug,
        p.summary, p.description, p.image_url, p.category,
        p.apple_url, p.spotify_url, p.youtube_url, p.website_url,
        p.featured, p.rss_status, p.podiverzum_rank, p.rank_label
      FROM jsonb_array_elements(c) WITH ORDINALITY AS t(cand, ord)
      JOIN podcasts p ON p.id = (cand->>'id')::uuid
      WHERE p.rss_status NOT IN ('failed','inactive')
        AND COALESCE(p.rank_label,'E') IN ('S','A','B')
      ORDER BY t.ord
      LIMIT lim;
      RETURN;
    END IF;
    -- Cold and busy: distinct transient outcome, client retries once.
    RAISE EXCEPTION 'recommendations_busy';
  END IF;

  -- Re-check after locking: a competing transaction may have just filled it.
  SELECT rc.candidates INTO c FROM recommendation_cache rc
  WHERE rc.kind = 'podcast' AND rc.source_id = p_podcast_id
    AND rc.computed_at > now() - interval '72 hours';
  IF c IS NOT NULL AND jsonb_array_length(c) > 0 THEN
    RETURN QUERY
    SELECT p.id, (cand->>'score')::float, p.title, p.display_title, p.slug,
      p.summary, p.description, p.image_url, p.category,
      p.apple_url, p.spotify_url, p.youtube_url, p.website_url,
      p.featured, p.rss_status, p.podiverzum_rank, p.rank_label
    FROM jsonb_array_elements(c) WITH ORDINALITY AS t(cand, ord)
    JOIN podcasts p ON p.id = (cand->>'id')::uuid
    WHERE p.rss_status NOT IN ('failed','inactive')
      AND COALESCE(p.rank_label,'E') IN ('S','A','B')
    ORDER BY t.ord
    LIMIT lim;
    RETURN;
  END IF;

  -- Nonexistent source: return empty WITHOUT caching (no arbitrary cache rows).
  PERFORM 1 FROM podcasts p WHERE p.id = p_podcast_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT pe.embedding INTO src_embedding FROM podcast_embeddings pe
  WHERE pe.podcast_id = p_podcast_id LIMIT 1;
  IF src_embedding IS NULL THEN
    INSERT INTO recommendation_cache (kind, source_id, candidates)
    VALUES ('podcast', p_podcast_id, '[]')
    ON CONFLICT (kind, source_id)
    DO UPDATE SET candidates = '[]', computed_at = now();
    RETURN;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', s.cid, 'score', s.score) ORDER BY s.ord) INTO c
  FROM (
    SELECT pe.podcast_id AS cid, (1 - (pe.embedding <=> src_embedding))::float AS score,
           row_number() OVER (ORDER BY pe.embedding <=> src_embedding) AS ord
    FROM podcast_embeddings pe
    JOIN podcasts p ON p.id = pe.podcast_id
    WHERE pe.podcast_id <> p_podcast_id
      AND p.rss_status NOT IN ('failed','inactive')
      AND COALESCE(p.rank_label,'E') IN ('S','A','B')
    ORDER BY pe.embedding <=> src_embedding
    LIMIT 8
  ) s;

  INSERT INTO recommendation_cache (kind, source_id, candidates)
  VALUES ('podcast', p_podcast_id, COALESCE(c, '[]'))
  ON CONFLICT (kind, source_id)
  DO UPDATE SET candidates = EXCLUDED.candidates, computed_at = now();

  RETURN QUERY
  SELECT p.id, (cand->>'score')::float, p.title, p.display_title, p.slug,
    p.summary, p.description, p.image_url, p.category,
    p.apple_url, p.spotify_url, p.youtube_url, p.website_url,
    p.featured, p.rss_status, p.podiverzum_rank, p.rank_label
  FROM jsonb_array_elements(COALESCE(c, '[]')) WITH ORDINALITY AS t(cand, ord)
  JOIN podcasts p ON p.id = (cand->>'id')::uuid
  WHERE p.rss_status NOT IN ('failed','inactive')
    AND COALESCE(p.rank_label,'E') IN ('S','A','B')
  ORDER BY t.ord
  LIMIT lim;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.similar_podcasts(uuid, integer) TO anon, authenticated, service_role;

DROP FUNCTION public.similar_episodes(uuid, integer);
CREATE FUNCTION public.similar_episodes(p_episode_id uuid, p_limit integer DEFAULT 6)
RETURNS TABLE(episode_id uuid, podcast_id uuid, similarity double precision, title text, display_title text, slug text, ai_summary text, summary text, description text, published_at timestamp with time zone, audio_url text, topics text[], podcast_slug text, podcast_title text, podcast_display_title text, podcast_image_url text, podcast_category text, podiverzum_rank numeric, rank_label text)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '2500ms'
AS $function$
DECLARE
  src_embedding vector(768);
  src_podcast_id uuid;
  c jsonb;
  c_at timestamptz;
  lim int := GREATEST(LEAST(p_limit, 8), 1); -- hard bound: 8 candidates max
  got_slot boolean := false;
  i int;
BEGIN
  -- Source existence + its podcast (needed for the different-podcast rule at read time).
  SELECT e.podcast_id INTO src_podcast_id FROM episodes e WHERE e.id = p_episode_id;

  SELECT rc.candidates, rc.computed_at INTO c, c_at
  FROM recommendation_cache rc
  WHERE rc.kind = 'episode' AND rc.source_id = p_episode_id;

  -- Fresh: non-empty for 72h; empty (no vector / no candidates) for 1h.
  IF c IS NOT NULL AND src_podcast_id IS NOT NULL AND (
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
    WHERE e.podcast_id <> src_podcast_id
      AND p.rss_status NOT IN ('failed','inactive')
      AND COALESCE(p.rank_label,'E') NOT IN ('D','E')
    ORDER BY t.ord
    LIMIT lim;
    RETURN;
  END IF;

  -- Compute needed. Global compute limit: 2 concurrent ANN recomputes across
  -- both RPCs; per-source lock prevents same-key storms. Transaction-scoped
  -- locks are released automatically on timeout/cancel.
  FOR i IN 0..1 LOOP
    IF pg_try_advisory_xact_lock(920000 + i) THEN got_slot := true; EXIT; END IF;
  END LOOP;
  IF NOT got_slot OR NOT pg_try_advisory_xact_lock(hashtext('episode:' || p_episode_id::text)) THEN
    IF c IS NOT NULL AND src_podcast_id IS NOT NULL AND jsonb_array_length(c) > 0 THEN
      -- Serve eligible stale cache while a competing refresh runs.
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
      WHERE e.podcast_id <> src_podcast_id
        AND p.rss_status NOT IN ('failed','inactive')
        AND COALESCE(p.rank_label,'E') NOT IN ('D','E')
      ORDER BY t.ord
      LIMIT lim;
      RETURN;
    END IF;
    -- Cold and busy: distinct transient outcome, client retries once.
    RAISE EXCEPTION 'recommendations_busy';
  END IF;

  -- Re-check after locking: a competing transaction may have just filled it.
  SELECT rc.candidates INTO c FROM recommendation_cache rc
  WHERE rc.kind = 'episode' AND rc.source_id = p_episode_id
    AND rc.computed_at > now() - interval '72 hours';
  IF c IS NOT NULL AND src_podcast_id IS NOT NULL AND jsonb_array_length(c) > 0 THEN
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
    WHERE e.podcast_id <> src_podcast_id
      AND p.rss_status NOT IN ('failed','inactive')
      AND COALESCE(p.rank_label,'E') NOT IN ('D','E')
    ORDER BY t.ord
    LIMIT lim;
    RETURN;
  END IF;

  -- Nonexistent source: return empty WITHOUT caching (no arbitrary cache rows).
  IF src_podcast_id IS NULL THEN RETURN; END IF;

  SELECT ee.embedding INTO src_embedding FROM episode_embeddings ee
  WHERE ee.episode_id = p_episode_id LIMIT 1;
  IF src_embedding IS NULL THEN
    INSERT INTO recommendation_cache (kind, source_id, candidates)
    VALUES ('episode', p_episode_id, '[]')
    ON CONFLICT (kind, source_id)
    DO UPDATE SET candidates = '[]', computed_at = now();
    RETURN;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', s.cid, 'score', s.score) ORDER BY s.ord) INTO c
  FROM (
    SELECT ee.episode_id AS cid, (1 - (ee.embedding <=> src_embedding))::float AS score,
           row_number() OVER (ORDER BY ee.embedding <=> src_embedding) AS ord
    FROM episode_embeddings ee
    JOIN episodes e ON e.id = ee.episode_id
    JOIN podcasts p ON p.id = ee.podcast_id
    WHERE ee.episode_id <> p_episode_id
      AND ee.podcast_id <> src_podcast_id
      AND p.rss_status NOT IN ('failed','inactive')
      AND COALESCE(p.rank_label,'E') NOT IN ('D','E')
    ORDER BY ee.embedding <=> src_embedding
    LIMIT 8
  ) s;

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
  WHERE e.podcast_id <> src_podcast_id
    AND p.rss_status NOT IN ('failed','inactive')
    AND COALESCE(p.rank_label,'E') NOT IN ('D','E')
  ORDER BY t.ord
  LIMIT lim;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.similar_episodes(uuid, integer) TO anon, authenticated, service_role;