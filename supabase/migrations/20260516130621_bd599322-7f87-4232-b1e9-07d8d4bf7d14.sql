ALTER TABLE public.entity_profiles
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_source text,
  ADD COLUMN IF NOT EXISTS image_checked_at timestamptz;