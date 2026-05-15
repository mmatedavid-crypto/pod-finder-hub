-- Token document-frequency cache for the rare-token MUST gate.
-- Lazy-filled on first lookup; entries refreshed weekly.
CREATE TABLE IF NOT EXISTS public.token_df_cache (
  token text PRIMARY KEY,
  df bigint NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.token_df_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "token_df_cache public read" ON public.token_df_cache;
CREATE POLICY "token_df_cache public read" ON public.token_df_cache
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "token_df_cache admin write" ON public.token_df_cache;
CREATE POLICY "token_df_cache admin write" ON public.token_df_cache
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Lookup + lazy-fill function. Returns df for each requested token.
-- Caps the count at 1000 (we only care about df < ~200 threshold).
-- Refreshes entries older than 7 days.
CREATE OR REPLACE FUNCTION public.token_idf(p_tokens text[])
RETURNS TABLE(token text, df bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text;
  cnt bigint;
  cached record;
BEGIN
  FOREACH t IN ARRAY p_tokens LOOP
    t := lower(btrim(t));
    IF length(t) < 3 OR length(t) > 40 THEN CONTINUE; END IF;

    SELECT c.df, c.computed_at INTO cached FROM public.token_df_cache c WHERE c.token = t;
    IF cached IS NOT NULL AND cached.computed_at > now() - interval '7 days' THEN
      token := t; df := cached.df; RETURN NEXT;
      CONTINUE;
    END IF;

    -- Compute df by partial scan (cap at 1000 for speed).
    BEGIN
      SELECT count(*)::bigint INTO cnt
      FROM (
        SELECT 1 FROM public.episodes
        WHERE search_tsv @@ plainto_tsquery('english', t)
        LIMIT 1000
      ) s;
    EXCEPTION WHEN OTHERS THEN
      cnt := 1000; -- safe fallback: treat as common
    END;

    INSERT INTO public.token_df_cache (token, df, computed_at)
    VALUES (t, cnt, now())
    ON CONFLICT (token) DO UPDATE SET df = EXCLUDED.df, computed_at = now();

    token := t; df := cnt; RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.token_idf(text[]) TO anon, authenticated, service_role;

-- Telemetry: capture confidence band per search.
ALTER TABLE public.search_events ADD COLUMN IF NOT EXISTS confidence_band text;