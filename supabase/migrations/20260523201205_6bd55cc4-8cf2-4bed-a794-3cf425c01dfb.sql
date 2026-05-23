
CREATE OR REPLACE FUNCTION public.purge_non_en_step(_budget_ms int DEFAULT 8000, _batch int DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t0 timestamptz := clock_timestamp();
  d int;
  total_emb int := 0;
  total_eps int := 0;
  total_pods int := 0;
  done_emb boolean := false;
  done_eps boolean := false;
BEGIN
  -- 1) episode_embeddings (heaviest)
  LOOP
    EXIT WHEN extract(milliseconds from clock_timestamp() - t0) >= _budget_ms;
    WITH x AS (SELECT ctid FROM public.episode_embeddings WHERE episode_id IN (SELECT id FROM public._purge_non_en_eps) LIMIT _batch)
    DELETE FROM public.episode_embeddings WHERE ctid IN (SELECT ctid FROM x);
    GET DIAGNOSTICS d = ROW_COUNT;
    total_emb := total_emb + d;
    IF d = 0 THEN done_emb := true; EXIT; END IF;
  END LOOP;

  -- 2) episodes themselves
  IF done_emb THEN
    LOOP
      EXIT WHEN extract(milliseconds from clock_timestamp() - t0) >= _budget_ms;
      WITH x AS (SELECT ctid FROM public.episodes WHERE id IN (SELECT id FROM public._purge_non_en_eps) LIMIT _batch)
      DELETE FROM public.episodes WHERE ctid IN (SELECT ctid FROM x);
      GET DIAGNOSTICS d = ROW_COUNT;
      total_eps := total_eps + d;
      IF d = 0 THEN done_eps := true; EXIT; END IF;
    END LOOP;
  END IF;

  -- 3) podcast deps + podcasts
  IF done_eps THEN
    DELETE FROM public.podcast_embeddings WHERE podcast_id IN (SELECT id FROM public._purge_non_en_pods);
    DELETE FROM public.ai_enrichment_jobs WHERE target_type='podcast' AND target_id IN (SELECT id FROM public._purge_non_en_pods);
    DELETE FROM public.rss_url_history WHERE podcast_id IN (SELECT id FROM public._purge_non_en_pods);
    DELETE FROM public.podcasts WHERE id IN (SELECT id FROM public._purge_non_en_pods);
    GET DIAGNOSTICS total_pods = ROW_COUNT;
    -- pi staging cleanup
    DELETE FROM public.pi_feed_staging
    WHERE processed = false
      AND ((language IS NOT NULL AND language NOT ILIKE 'en%')
        OR (ai_detected_language IS NOT NULL AND ai_detected_language NOT ILIKE 'en%'));
    DELETE FROM public.discovery_queue
    WHERE status = 'pending' AND language IS NOT NULL AND language NOT ILIKE 'en%';
  END IF;

  RETURN jsonb_build_object(
    'deleted_embeddings', total_emb,
    'deleted_episodes', total_eps,
    'deleted_podcasts', total_pods,
    'embeddings_drained', done_emb,
    'episodes_drained', done_eps,
    'elapsed_ms', extract(milliseconds from clock_timestamp() - t0)
  );
END $$;

REVOKE ALL ON FUNCTION public.purge_non_en_step(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_non_en_step(int, int) TO service_role, authenticated;
