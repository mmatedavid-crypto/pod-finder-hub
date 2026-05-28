-- Drop public read policy that exposed cost columns
DROP POLICY IF EXISTS "Public can read rendered tiktok videos" ON public.tiktok_videos;

-- Safe public view (no cost or model columns)
CREATE OR REPLACE VIEW public.tiktok_videos_public
WITH (security_invoker = on) AS
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

-- Allow the view's underlying SELECT to succeed for anon/authenticated by adding
-- a narrow RLS policy on the base table that restricts to rendered rows; the view
-- still only projects safe columns. (security_invoker uses caller's role.)
CREATE POLICY "Public can read rendered tiktok videos via view"
ON public.tiktok_videos
FOR SELECT
USING (status = 'rendered' AND video_url IS NOT NULL);