CREATE OR REPLACE FUNCTION public.match_podcast_by_name(p_q text, p_max int DEFAULT 3, p_threshold float DEFAULT 0.45)
RETURNS TABLE(podcast_id uuid, title text, slug text, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH q AS (SELECT btrim(p_q) AS qn)
  SELECT p.id, p.title, p.slug,
         similarity(p.title, (SELECT qn FROM q))::real AS sim
  FROM public.podcasts p
  WHERE p.title % (SELECT qn FROM q)
    AND (p.language IS NULL OR p.language ILIKE 'en%')
    AND p.rss_status NOT IN ('failed','inactive')
  ORDER BY sim DESC, p.podiverzum_rank DESC
  LIMIT p_max
$$;