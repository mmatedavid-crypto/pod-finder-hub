
CREATE OR REPLACE FUNCTION public.admin_update_entity_images_by_kind(p_kind text, p_slugs text[], p_urls text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n int;
BEGIN
  WITH pairs AS (
    SELECT unnest(p_slugs) AS slug, NULLIF(unnest(p_urls), '') AS url
  )
  UPDATE entity_profiles ep
     SET image_url = pairs.url,
         image_source = CASE WHEN pairs.url IS NOT NULL THEN 'wikipedia' ELSE ep.image_source END,
         image_checked_at = now()
    FROM pairs
   WHERE ep.kind = p_kind AND ep.slug = pairs.slug;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END$function$;
