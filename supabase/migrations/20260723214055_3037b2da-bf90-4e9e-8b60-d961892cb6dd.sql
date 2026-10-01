DROP POLICY IF EXISTS "Public read tiktok-videos" ON storage.objects;
CREATE POLICY "Public read rendered tiktok-videos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'tiktok-videos'
  AND EXISTS (
    SELECT 1 FROM public.tiktok_videos tv
    WHERE tv.status = 'rendered'
      AND tv.id::text = split_part(storage.objects.name, '/', 1)
  )
);