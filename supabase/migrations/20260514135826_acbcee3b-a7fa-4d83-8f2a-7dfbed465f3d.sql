ALTER TABLE public.page_events ADD COLUMN user_agent text;
CREATE INDEX IF NOT EXISTS idx_page_events_ua ON public.page_events (user_agent) WHERE user_agent IS NOT NULL;