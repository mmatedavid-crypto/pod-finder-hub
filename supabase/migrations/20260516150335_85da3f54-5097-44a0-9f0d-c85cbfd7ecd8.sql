
-- Make chunk-candidate selection transcript-driven (small table) instead of
-- scanning the 740k episodes table. Also flip 'no_transcript' back into the
-- pool so episodes get retried when a transcript later lands.

CREATE INDEX IF NOT EXISTS idx_episodes_chunks_status_pending
  ON public.episodes (chunks_status)
  WHERE chunks_status IS NULL OR chunks_status IN ('pending','stale','no_transcript');

CREATE INDEX IF NOT EXISTS idx_episode_transcripts_found
  ON public.episode_transcripts (episode_id)
  WHERE status = 'found';

CREATE OR REPLACE FUNCTION public.select_chunk_candidates(_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, podcast_id uuid, description text, display_title text, podcast_title text, podcast_category text, shadow_rank_tier text, transcript_text text, transcript_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    e.id,
    e.podcast_id,
    e.description,
    COALESCE(e.display_title, e.title) AS display_title,
    COALESCE(p.display_title, p.title) AS podcast_title,
    p.category AS podcast_category,
    p.shadow_rank_tier,
    et.text AS transcript_text,
    et.source AS transcript_source
  FROM public.episode_transcripts et
  JOIN public.episodes e ON e.id = et.episode_id
  JOIN public.podcasts p ON p.id = e.podcast_id
  WHERE et.status = 'found'
    AND et.text IS NOT NULL
    AND length(et.text) >= 500
    AND (e.chunks_status IS NULL OR e.chunks_status IN ('pending','stale','no_transcript'))
    AND (p.language IS NULL OR p.language ILIKE 'en%')
    AND (p.shadow_rank_tier IS NULL OR p.shadow_rank_tier IN ('S','A','B','C'))
  ORDER BY
    CASE p.shadow_rank_tier WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 ELSE 5 END,
    e.published_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(500, _limit));
$function$;

CREATE OR REPLACE FUNCTION public.chunk_candidate_stats()
 RETURNS TABLE(pending bigint, total_chunks bigint, episodes_with_chunks bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)
       FROM public.episode_transcripts et
       JOIN public.episodes e ON e.id = et.episode_id
       JOIN public.podcasts p ON p.id = e.podcast_id
       WHERE et.status = 'found'
         AND length(coalesce(et.text,'')) >= 500
         AND (e.chunks_status IS NULL OR e.chunks_status IN ('pending','stale','no_transcript'))
         AND (p.language IS NULL OR p.language ILIKE 'en%')),
    (SELECT count(*) FROM public.episode_chunks),
    (SELECT count(DISTINCT episode_id) FROM public.episode_chunks);
$function$;

-- Re-open episodes previously marked no_transcript so the new transcripts get picked up
UPDATE public.episodes
SET chunks_status = 'pending'
WHERE chunks_status = 'no_transcript'
  AND EXISTS (
    SELECT 1 FROM public.episode_transcripts et
    WHERE et.episode_id = episodes.id AND et.status = 'found' AND length(coalesce(et.text,'')) >= 500
  );
