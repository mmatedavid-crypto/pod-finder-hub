CREATE TABLE IF NOT EXISTS public.entity_profiles (
  kind text NOT NULL,
  slug text NOT NULL,
  display_name text NOT NULL,
  bio text,
  episodes_summary text,
  episode_ids uuid[] NOT NULL DEFAULT '{}',
  model text,
  cost_usd numeric,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, slug)
);

ALTER TABLE public.entity_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_profiles public read" ON public.entity_profiles
  FOR SELECT USING (true);

CREATE POLICY "entity_profiles admin write" ON public.entity_profiles
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_entity_profiles_updated_at ON public.entity_profiles(updated_at DESC);