
INSERT INTO public.app_settings (key, value) VALUES (
  'smart_player',
  '{"enabled": false, "dev_preview_enabled": true, "show_on_public_episode_pages": false, "show_taste_buttons": false, "show_semantic_queue": false}'::jsonb
) ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.player_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  episode_id uuid,
  podcast_id uuid,
  session_id text,
  position_sec integer,
  duration_sec integer,
  playback_rate numeric,
  viewport_width integer,
  user_agent text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.player_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can log player event"
  ON public.player_events FOR INSERT TO public
  WITH CHECK (user_agent IS NOT NULL AND length(btrim(user_agent)) > 0);

CREATE POLICY "admins read player events"
  ON public.player_events FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS player_events_created_idx ON public.player_events (created_at DESC);
CREATE INDEX IF NOT EXISTS player_events_episode_idx ON public.player_events (episode_id, created_at DESC);
CREATE INDEX IF NOT EXISTS player_events_event_idx ON public.player_events (event_type, created_at DESC);
