
CREATE TABLE public.episode_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  episode_id uuid,
  podcast_id uuid,
  event_type text NOT NULL,
  platform text,
  referrer text,
  viewport_width integer,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.episode_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can log episode event"
ON public.episode_events
FOR INSERT
WITH CHECK (true);

CREATE POLICY "admins read episode events"
ON public.episode_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_episode_events_episode_created ON public.episode_events (episode_id, created_at DESC);
CREATE INDEX idx_episode_events_created ON public.episode_events (created_at DESC);
CREATE INDEX idx_episode_events_type_created ON public.episode_events (event_type, created_at DESC);
