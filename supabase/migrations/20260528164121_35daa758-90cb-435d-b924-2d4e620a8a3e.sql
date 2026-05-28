-- Remove the base-table public read that still allowed select * with costs
DROP POLICY IF EXISTS "Public can read rendered tiktok videos via view" ON public.tiktok_videos;

-- Recreate view as SECURITY DEFINER (default) so it bypasses base-table RLS
-- but only projects safe columns
DROP VIEW IF EXISTS public.tiktok_videos_public;
CREATE VIEW public.tiktok_videos_public AS
SELECT
  id,
  episode_id,
  podcast_id,
  status,
  video_url,
  video_duration_s,
  generated_at,
  created_at
FROM public.tiktok_videos
WHERE status = 'rendered' AND video_url IS NOT NULL;

GRANT SELECT ON public.tiktok_videos_public TO anon, authenticated;