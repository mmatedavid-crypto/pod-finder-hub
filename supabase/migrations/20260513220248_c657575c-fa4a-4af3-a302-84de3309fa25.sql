ALTER TABLE public.entity_profiles
  ADD COLUMN IF NOT EXISTS featured_episode_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS appearance_stats jsonb NOT NULL DEFAULT '{}'::jsonb;