CREATE OR REPLACE FUNCTION public.select_embed_candidates(_model text, _tiers text[], _limit integer)
 RETURNS TABLE(id uuid, title text, display_title text, description text, seo_description text, category text, rank_label text, shadow_rank_components jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.title, p.display_title, p.description, p.seo_description,
         p.category, p.rank_label, p.shadow_rank_components
    FROM public.podcasts p
    LEFT JOIN public.podcast_embeddings e
      ON e.podcast_id = p.id AND e.model = _model
   WHERE p.rank_label = ANY(_tiers)
     AND e.podcast_id IS NULL
     AND (p.language IS NULL OR p.language ILIKE 'en%')
     AND COALESCE(p.shadow_rank_components->>'health_state','') NOT IN
         ('rss_url_not_found','needs_manual_rss_review','confirmed_dead','quarantined_spam')
   ORDER BY array_position(ARRAY['S','A','B','C','D','E']::text[], p.rank_label) NULLS LAST,
            p.podiverzum_rank DESC NULLS LAST
   LIMIT _limit;
$function$;