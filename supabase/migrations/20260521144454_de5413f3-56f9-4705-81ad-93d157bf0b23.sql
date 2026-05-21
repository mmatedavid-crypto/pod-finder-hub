
CREATE TABLE IF NOT EXISTS public.watchdog_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner text NOT NULL,
  rule text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warn','critical')),
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedup_key text NOT NULL,
  auto_paused boolean NOT NULL DEFAULT false,
  alert_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watchdog_events_created_idx ON public.watchdog_events (created_at DESC);
CREATE INDEX IF NOT EXISTS watchdog_events_dedup_idx ON public.watchdog_events (dedup_key, created_at DESC);
CREATE INDEX IF NOT EXISTS watchdog_events_runner_idx ON public.watchdog_events (runner, created_at DESC);

ALTER TABLE public.watchdog_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "watchdog_events admin read"
  ON public.watchdog_events FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "watchdog_events service write"
  ON public.watchdog_events FOR INSERT
  WITH CHECK (true);

INSERT INTO public.app_settings (key, value)
VALUES (
  'watchdog_state',
  jsonb_build_object(
    'enabled', true,
    'dry_run', true,
    'stale_lock_minutes', 60,
    'alert_dedup_minutes', 30,
    'budget_overshoot_ratio', 1.2,
    'error_rate_window_minutes', 30,
    'min_calls_for_error_rate', 10,
    'runners', jsonb_build_array(
      jsonb_build_object('name','seo_enrich','spend_key','seo_enrich','controls_key','ai_seo_controls','cadence_minutes',15),
      jsonb_build_object('name','embed_podcast','spend_key','embed_podcast','controls_key','embed_controls','progress_key','embed_progress','cadence_minutes',15),
      jsonb_build_object('name','embed_episode','spend_key','embed_episode','controls_key','embed_episode_controls','progress_key','embed_episode_progress','cadence_minutes',15),
      jsonb_build_object('name','embed_chunks','spend_key','embed_chunks','controls_key','embed_chunks_controls','progress_key','embed_chunks_progress','cadence_minutes',30),
      jsonb_build_object('name','embed_description','spend_key','embed_description','controls_key','embed_description_controls','progress_key','embed_description_progress','cadence_minutes',30),
      jsonb_build_object('name','categorize_podcast','spend_key','categorize_podcast','controls_key','ai_categorize_controls','cadence_minutes',60),
      jsonb_build_object('name','entity_extract','spend_key','entity_extract','controls_key','ai_entity_controls','cadence_minutes',60),
      jsonb_build_object('name','ai_feed_scout','spend_key','ai_feed_scout','cadence_minutes',360),
      jsonb_build_object('name','daily_social_post','spend_key','daily_social_post','cadence_minutes',1500),
      jsonb_build_object('name','tiktok_generate','spend_key','tiktok_generate','controls_key','tiktok_generate_controls','cadence_minutes',1500)
    )
  )
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
