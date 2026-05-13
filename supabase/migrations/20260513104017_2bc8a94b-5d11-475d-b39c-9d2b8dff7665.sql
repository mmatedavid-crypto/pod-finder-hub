CREATE OR REPLACE FUNCTION public.entity_slugify(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from regexp_replace(
           lower(unaccent(coalesce(s,''))),
           '[^a-z0-9]+', '-', 'g'
         ));
$$;

-- Fallback if unaccent extension not installed: use translate for common chars.
-- Try installing unaccent (idempotent)
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.episodes_by_entity(
  p_kind text,
  p_slug text,
  p_limit int DEFAULT 200
)
RETURNS SETOF episodes
LANGUAGE sql
STABLE
AS $$
  SELECT e.*
  FROM episodes e
  WHERE
    CASE p_kind
      WHEN 'person'     THEN EXISTS (SELECT 1 FROM unnest(e.people)      v WHERE entity_slugify(v) = lower(p_slug))
      WHEN 'company'    THEN EXISTS (SELECT 1 FROM unnest(e.companies)   v WHERE entity_slugify(v) = lower(p_slug))
      WHEN 'topic'      THEN EXISTS (SELECT 1 FROM unnest(e.topics)      v WHERE entity_slugify(v) = lower(p_slug))
      WHEN 'ingredient' THEN EXISTS (SELECT 1 FROM unnest(e.ingredients) v WHERE entity_slugify(v) = lower(p_slug))
      WHEN 'ticker'     THEN EXISTS (SELECT 1 FROM unnest(e.tickers)     v WHERE upper(regexp_replace(v,'[^a-zA-Z0-9.]+','','g')) = upper(p_slug))
      ELSE false
    END
  ORDER BY e.published_at DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.episodes_by_entity(text,text,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entity_slugify(text) TO anon, authenticated;