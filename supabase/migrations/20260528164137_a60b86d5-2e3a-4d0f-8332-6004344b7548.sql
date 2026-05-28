-- Switch view back to security_invoker (no SECURITY DEFINER warning)
DROP VIEW IF EXISTS public.tiktok_videos_public;
CREATE VIEW public.tiktok_videos_public
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

-- Re-add base table SELECT policy for rendered rows (needed for security_invoker view)
CREATE POLICY "Public can read rendered tiktok videos (cols restricted)"
ON public.tiktok_videos
FOR SELECT
USING (status = 'rendered' AND video_url IS NOT NULL);

-- Column-level permissions: revoke broad SELECT, grant only safe columns
REVOKE SELECT ON public.tiktok_videos FROM anon, authenticated;
GRANT SELECT (id, episode_id, podcast_id, status, video_url, video_duration_s, generated_at, created_at)
  ON public.tiktok_videos TO anon, authenticated;

GRANT SELECT ON public.tiktok_videos_public TO anon, authenticated;
GRANT ALL ON public.tiktok_videos TO service_role;