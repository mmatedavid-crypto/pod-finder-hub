-- mood_pool table
CREATE TABLE public.mood_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  mood text NOT NULL,
  description text,
  query text NOT NULL,
  accent_hsl text,
  embedding vector(768),
  episode_ids uuid[] NOT NULL DEFAULT '{}',
  episodes_refreshed_at timestamptz,
  time_tags text[] NOT NULL DEFAULT '{any}',
  country_hint text,
  status text NOT NULL DEFAULT 'active', -- active | retired
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  ctr numeric GENERATED ALWAYS AS (CASE WHEN impressions > 0 THEN clicks::numeric / impressions ELSE 0 END) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_shown_at timestamptz,
  retired_at timestamptz,
  retire_reason text
);

CREATE INDEX mood_pool_status_ctr_idx ON public.mood_pool(status, ctr DESC);
CREATE INDEX mood_pool_status_created_idx ON public.mood_pool(status, created_at DESC);

ALTER TABLE public.mood_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mood_pool public read" ON public.mood_pool FOR SELECT USING (true);
CREATE POLICY "mood_pool admin write" ON public.mood_pool FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Helper: derive time tags from hour/dow
CREATE OR REPLACE FUNCTION public._mood_time_tags(p_hour int, p_dow int)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY(
    SELECT DISTINCT t FROM unnest(ARRAY[
      'any',
      CASE
        WHEN p_hour BETWEEN 5 AND 8 THEN 'morning'
        WHEN p_hour BETWEEN 9 AND 11 THEN 'mid-morning'
        WHEN p_hour BETWEEN 12 AND 13 THEN 'lunch'
        WHEN p_hour BETWEEN 14 AND 16 THEN 'afternoon'
        WHEN p_hour BETWEEN 17 AND 19 THEN 'evening'
        WHEN p_hour BETWEEN 20 AND 22 THEN 'night'
        ELSE 'late-night'
      END,
      CASE WHEN p_dow IN (0,6) THEN 'weekend' ELSE 'weekday' END
    ]) AS t
  );
$$;

-- Pick K active moods matching the visitor's context
CREATE OR REPLACE FUNCTION public.mood_pool_pick(p_country text, p_hour int, p_dow int, p_k int)
RETURNS SETOF public.mood_pool
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ctx_tags text[] := public._mood_time_tags(p_hour, p_dow);
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT m.*,
      (m.time_tags && ctx_tags)::int AS context_match,
      -- recency boost (0..1) within last 30d created
      GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - m.created_at)) / (30*86400.0)) AS recency,
      random() AS r
    FROM public.mood_pool m
    WHERE m.status = 'active'
  )
  SELECT id, slug, title, mood, description, query, accent_hsl, embedding,
         episode_ids, episodes_refreshed_at, time_tags, country_hint,
         status, impressions, clicks, ctr, created_at, last_shown_at, retired_at, retire_reason
  FROM scored
  ORDER BY context_match DESC,
           (COALESCE(ctr,0) * LEAST(impressions, 200) / 200.0 + recency * 0.4 + r * 0.3) DESC
  LIMIT p_k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mood_pool_pick(text, int, int, int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mood_pool_bump_impression(p_slug text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.mood_pool
     SET impressions = impressions + 1,
         last_shown_at = now()
   WHERE slug = p_slug AND status = 'active';
$$;
GRANT EXECUTE ON FUNCTION public.mood_pool_bump_impression(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mood_pool_bump_click(p_slug text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.mood_pool
     SET clicks = clicks + 1
   WHERE slug = p_slug;
$$;
GRANT EXECUTE ON FUNCTION public.mood_pool_bump_click(text) TO anon, authenticated;

-- Retire to keep at most p_keep active rows.
-- Protect "new grace": rows < 7 days old or < 50 impressions are kept unless overflow.
CREATE OR REPLACE FUNCTION public.mood_pool_retire_overflow(p_keep int)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_active int;
  v_to_retire int;
  v_retired int := 0;
BEGIN
  -- Step 1: retire mature low-CTR rows beyond keep
  SELECT COUNT(*) INTO v_active FROM public.mood_pool WHERE status = 'active';
  IF v_active <= p_keep THEN
    RETURN 0;
  END IF;
  v_to_retire := v_active - p_keep;

  WITH ranked AS (
    SELECT id,
           (impressions >= 50 AND (now() - created_at) > interval '7 days') AS mature
    FROM public.mood_pool
    WHERE status = 'active'
    ORDER BY mature DESC, ctr ASC, impressions DESC, created_at ASC
    LIMIT v_to_retire
  )
  UPDATE public.mood_pool m
     SET status='retired', retired_at = now(),
         retire_reason = CASE WHEN r.mature THEN 'low_ctr' ELSE 'overflow' END
    FROM ranked r
   WHERE m.id = r.id;
  GET DIAGNOSTICS v_retired = ROW_COUNT;
  RETURN v_retired;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mood_pool_retire_overflow(int) TO authenticated;