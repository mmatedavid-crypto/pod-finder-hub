-- Cache for AI-generated personalized mood collections.
-- Bucketed by (country, hour_bucket=floor(local_hour/4) 0-5, dow 0-6)
-- 6h cache, ~42 entries per country max.
CREATE TABLE IF NOT EXISTS public.dynamic_mood_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL,
  hour_bucket smallint NOT NULL CHECK (hour_bucket BETWEEN 0 AND 5),
  dow smallint NOT NULL CHECK (dow BETWEEN 0 AND 6),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
  hits integer NOT NULL DEFAULT 0,
  UNIQUE (country, hour_bucket, dow)
);

CREATE INDEX IF NOT EXISTS dynamic_mood_cache_expires_idx ON public.dynamic_mood_cache (expires_at);

ALTER TABLE public.dynamic_mood_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dyn_mood_cache public read"
  ON public.dynamic_mood_cache FOR SELECT
  USING (true);

CREATE POLICY "dyn_mood_cache admin write"
  ON public.dynamic_mood_cache FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));