CREATE OR REPLACE FUNCTION public.match_podcast_by_name(p_q text, p_max int DEFAULT 3, p_threshold float DEFAULT 0.45)
RETURNS TABLE(podcast_id uuid, title text, slug text, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH q AS (SELECT lower(btrim(p_q)) AS qn)
  SELECT p.id, p.title, p.slug,
         GREATEST(
           similarity(lower(p.title), (SELECT qn FROM q)),
           similarity(regexp_replace(lower(p.title), '[^a-z0-9 ]+', ' ', 'g'),
                      regexp_replace((SELECT qn FROM q), '[^a-z0-9 ]+', ' ', 'g'))
         )::real AS sim
  FROM public.podcasts p
  WHERE (p.language IS NULL OR p.language ILIKE 'en%')
    AND p.rss_status NOT IN ('failed','inactive')
    AND (
      lower(p.title) % (SELECT qn FROM q)
      OR regexp_replace(lower(p.title), '[^a-z0-9 ]+', ' ', 'g') % regexp_replace((SELECT qn FROM q), '[^a-z0-9 ]+', ' ', 'g')
    )
  ORDER BY sim DESC, p.podiverzum_rank DESC
  LIMIT p_max
$$;

GRANT EXECUTE ON FUNCTION public.match_podcast_by_name(text, int, float) TO anon, authenticated, service_role;