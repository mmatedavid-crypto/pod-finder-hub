
CREATE TABLE IF NOT EXISTS public.queue_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner text NOT NULL,
  action text NOT NULL,
  reason text,
  pending_now integer,
  pending_prev integer,
  pending_prev_prev integer,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qhe_runner_created ON public.queue_health_events (runner, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qhe_created ON public.queue_health_events (created_at DESC);

ALTER TABLE public.queue_health_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qhe admin read" ON public.queue_health_events;
CREATE POLICY "qhe admin read" ON public.queue_health_events
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "qhe admin write" ON public.queue_health_events;
CREATE POLICY "qhe admin write" ON public.queue_health_events
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'queue_health_state',
  jsonb_build_object(
    'enabled', true,
    'dry_run', true,
    'runners', jsonb_build_array(
      jsonb_build_object('name','description-cleanup-runner','controls_key','description_cleanup_controls','pending_kind','description_cleanup_pending','wake_threshold',50,'stall_runs',2),
      jsonb_build_object('name','embed-episode-runner','controls_key','embed_episode_controls','pending_kind','embed_episode_missing','wake_threshold',50,'stall_runs',2),
      jsonb_build_object('name','embed-podcast-runner','controls_key','embed_controls','pending_kind','embed_podcast_missing','wake_threshold',10,'stall_runs',2),
      jsonb_build_object('name','embed-chunks-runner','controls_key','embed_chunks_controls','pending_kind','episodes_chunks_pending','wake_threshold',50,'stall_runs',2),
      jsonb_build_object('name','embed-description-runner','controls_key','embed_description_controls','pending_kind','desc_chunk_pending','wake_threshold',50,'stall_runs',2),
      jsonb_build_object('name','seo-enrich-runner','controls_key','ai_seo_controls','pending_kind','ai_jobs_seo_pending','wake_threshold',20,'stall_runs',2),
      jsonb_build_object('name','entity-extract-runner','controls_key','ai_entity_controls','pending_kind','ai_jobs_entity_pending','wake_threshold',10,'stall_runs',2),
      jsonb_build_object('name','categorize-podcast-runner','controls_key','ai_categorize_controls','pending_kind','podcasts_ai_category_pending','wake_threshold',10,'stall_runs',2),
      jsonb_build_object('name','rss-hunter','controls_key','rss_hunter_controls','pending_kind','rss_hunter_pending','wake_threshold',5,'stall_runs',2)
    ),
    'history', '{}'::jsonb
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();
