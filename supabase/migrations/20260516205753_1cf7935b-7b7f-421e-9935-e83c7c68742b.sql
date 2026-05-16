ALTER TABLE public.page_events
  ADD COLUMN IF NOT EXISTS visitor_id text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS country text;

CREATE INDEX IF NOT EXISTS page_events_visitor_idx ON public.page_events (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS page_events_session_idx ON public.page_events (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS page_events_country_idx ON public.page_events (country, created_at DESC);
CREATE INDEX IF NOT EXISTS page_events_created_idx ON public.page_events (created_at DESC);