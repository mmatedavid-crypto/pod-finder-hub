
-- Spell-correction RPC for the search hallucination guard.
-- For each unknown query token, suggest the most similar in-corpus token
-- (df >= 50) using pg_trgm word_similarity. Returns one row per input token
-- with a non-null suggestion only if similarity >= 0.6.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS token_df_cache_token_trgm_idx
  ON public.token_df_cache USING gin (token gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.suggest_token_corrections(p_tokens text[])
RETURNS TABLE(token text, suggestion text, similarity real, df bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text;
  rec record;
BEGIN
  IF p_tokens IS NULL OR array_length(p_tokens, 1) IS NULL THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY p_tokens LOOP
    t := lower(btrim(t));
    IF length(t) < 4 OR length(t) > 30 THEN CONTINUE; END IF;
    SELECT c.token AS suggestion, similarity(c.token, t) AS sim, c.df
      INTO rec
      FROM public.token_df_cache c
     WHERE c.df >= 50
       AND c.token <> t
       AND c.token % t
     ORDER BY similarity(c.token, t) DESC, c.df DESC
     LIMIT 1;
    IF rec IS NOT NULL AND rec.sim >= 0.6 THEN
      token := t; suggestion := rec.suggestion; similarity := rec.sim; df := rec.df;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_token_corrections(text[]) TO anon, authenticated, service_role;
