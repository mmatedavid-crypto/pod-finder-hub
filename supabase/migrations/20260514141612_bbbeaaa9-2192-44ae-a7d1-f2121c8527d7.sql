DROP POLICY IF EXISTS "anyone can log page view" ON public.page_events;

CREATE POLICY "anyone with UA can log page view"
ON public.page_events
FOR INSERT
TO public
WITH CHECK (
  user_agent IS NOT NULL
  AND length(btrim(user_agent)) > 0
);