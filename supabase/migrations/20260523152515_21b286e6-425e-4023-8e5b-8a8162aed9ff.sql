
ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS display_description text,
  ADD COLUMN IF NOT EXISTS description_cleaned_at timestamptz,
  ADD COLUMN IF NOT EXISTS description_cleanup_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS description_cleanup_meta jsonb NOT NULL DEFAULT '{}'::jsonb;
