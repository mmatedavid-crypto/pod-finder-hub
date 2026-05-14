
CREATE TABLE public.tiktok_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  podcast_id uuid NOT NULL REFERENCES public.podcasts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  script text,
  script_model text,
  script_cost_usd numeric(8,4) DEFAULT 0,
  voiceover_url text,
  voiceover_duration_s numeric(6,2),
  voiceover_cost_usd numeric(8,4) DEFAULT 0,
  subtitle_words jsonb,
  broll_image_urls text[] DEFAULT '{}',
  broll_cost_usd numeric(8,4) DEFAULT 0,
  video_url text,
  video_duration_s numeric(6,2),
  render_cost_usd numeric(8,4) DEFAULT 0,
  total_cost_usd numeric(8,4) DEFAULT 0,
  error text,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tiktok_videos_episode ON public.tiktok_videos(episode_id);
CREATE INDEX idx_tiktok_videos_status_created ON public.tiktok_videos(status, created_at DESC);
CREATE INDEX idx_tiktok_videos_created ON public.tiktok_videos(created_at DESC);

ALTER TABLE public.tiktok_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read rendered tiktok videos"
ON public.tiktok_videos FOR SELECT
USING (status = 'rendered');

CREATE POLICY "Admins can read all tiktok videos"
ON public.tiktok_videos FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert tiktok videos"
ON public.tiktok_videos FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update tiktok videos"
ON public.tiktok_videos FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tiktok videos"
ON public.tiktok_videos FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_tiktok_videos_updated
BEFORE UPDATE ON public.tiktok_videos
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('tiktok-videos', 'tiktok-videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read tiktok-videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'tiktok-videos');

CREATE POLICY "Service role write tiktok-videos"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'tiktok-videos');

CREATE POLICY "Service role update tiktok-videos"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'tiktok-videos');
