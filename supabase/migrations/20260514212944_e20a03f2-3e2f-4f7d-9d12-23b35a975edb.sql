CREATE OR REPLACE FUNCTION public.search_episodes_hybrid(
  q text,
  q_embedding vector DEFAULT NULL::vector,
  limit_n integer DEFAULT 50,
  lang text DEFAULT 'en'::text,
  required_terms text[] DEFAULT NULL::text[],
  entity_terms text[] DEFAULT NULL::text[],
  alpha_lex numeric DEFAULT 0.5
)
RETURNS TABLE(episode_id uuid, score numeric, lex_rank integer, sem_rank integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH
  ts AS (SELECT websearch_to_tsquery('simple', coalesce(q,'')) AS tsq),
  lex AS (
    SELECT e.id, ts_rank_cd(e.search_tsv, (SELECT tsq FROM ts)) AS r
    FROM public.episodes e
    WHERE e.search_tsv @@ (SELECT tsq FROM ts)
      AND (
        required_terms IS NULL
        OR array_length(required_terms, 1) IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(required_terms) AS rt(term)
          WHERE length(btrim(rt.term)) >= 3
            AND lower(coalesce(e.search_text,'')) !~* ('\m' || regexp_replace(lower(btrim(rt.term)), '([\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\^\\$])', '\\\1', 'g') || '\M')
        )
      )
    ORDER BY r DESC
    LIMIT 240
  ),
  lex_ranked AS (
    SELECT id, row_number() OVER (ORDER BY r DESC) AS rk FROM lex
  ),
  sem AS (
    SELECT ee.episode_id AS id,
           row_number() OVER (ORDER BY ee.embedding <=> q_embedding) AS rk
    FROM public.episode_embeddings ee
    WHERE q_embedding IS NOT NULL
    ORDER BY ee.embedding <=> q_embedding
    LIMIT 160
  ),
  fused AS (
    SELECT
      coalesce(l.id, s.id) AS id,
      l.rk AS lex_rk,
      s.rk AS sem_rk,
      ( coalesce(alpha_lex, 0.5) * (CASE WHEN l.rk IS NOT NULL THEN 1.0/(60+l.rk) ELSE 0 END)
      + (1.0 - coalesce(alpha_lex, 0.5)) * (CASE WHEN s.rk IS NOT NULL THEN 1.0/(60+s.rk) ELSE 0 END)
      ) AS base_score
    FROM lex_ranked l
    FULL OUTER JOIN sem s ON s.id = l.id
  ),
  with_boost AS (
    SELECT
      f.id, f.lex_rk, f.sem_rk,
      f.base_score
        + CASE
            WHEN entity_terms IS NOT NULL
             AND array_length(entity_terms, 1) IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM unnest(
                      coalesce(e.topics,ARRAY[]::text[])
                   || coalesce(e.people,ARRAY[]::text[])
                   || coalesce(e.companies,ARRAY[]::text[])
                   || coalesce(e.tickers,ARRAY[]::text[])
                   || coalesce(e.ingredients,ARRAY[]::text[])
                    ) AS u(tag),
                    unnest(entity_terms) AS et(term)
               WHERE length(btrim(et.term)) >= 2
                 AND lower(u.tag) = lower(btrim(et.term))
             )
            THEN 0.05
            ELSE 0
          END
        + CASE
            WHEN required_terms IS NOT NULL
             AND array_length(required_terms, 1) IS NOT NULL
             AND NOT EXISTS (
               SELECT 1
               FROM unnest(required_terms) AS rt(term)
               WHERE length(btrim(rt.term)) >= 3
                 AND lower(coalesce(e.search_text,'')) !~* ('\m' || regexp_replace(lower(btrim(rt.term)), '([\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\^\\$])', '\\\1', 'g') || '\M')
             )
            THEN 0.035
            ELSE 0
          END AS score
    FROM fused f
    JOIN public.episodes e ON e.id = f.id
  ),
  filtered AS (
    SELECT w.id, w.score, w.lex_rk, w.sem_rk
    FROM with_boost w
    JOIN public.episodes e ON e.id = w.id
    JOIN public.podcasts p ON p.id = e.podcast_id
    WHERE (lang IS NULL OR p.language IS NULL OR p.language ILIKE lang || '%')
      AND (p.featured OR p.rss_status IS NULL OR p.rss_status NOT IN ('failed','inactive'))
      AND (
        required_terms IS NULL
        OR array_length(required_terms, 1) IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(required_terms) AS rt(term)
          WHERE length(btrim(rt.term)) >= 3
            AND lower(coalesce(e.search_text,'')) !~* ('\m' || regexp_replace(lower(btrim(rt.term)), '([\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\^\\$])', '\\\1', 'g') || '\M')
        )
      )
  )
  SELECT id AS episode_id, score::numeric, coalesce(lex_rk,0)::int, coalesce(sem_rk,0)::int
  FROM filtered
  ORDER BY score DESC
  LIMIT limit_n;
$function$;