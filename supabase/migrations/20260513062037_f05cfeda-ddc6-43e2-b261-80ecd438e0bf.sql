-- One-shot re-enrich enqueue for podcasts with overly short SEO descriptions.
-- Uses fresh input_hash 'reshort_v1:<id>' so the runner builds a NEW prompt
-- (with recent episode context) and the upsert dedup doesn't collide with
-- prior jobs. Priority bumped above normal tier priority so they drain first.
INSERT INTO ai_enrichment_jobs (kind, target_type, target_id, input_hash, priority, status, result)
SELECT
  'seo_podcast',
  'podcast',
  p.id,
  'reshort_v1:' || p.id::text,
  CASE p.rank_label
    WHEN 'S' THEN 110
    WHEN 'A' THEN 90
    WHEN 'B' THEN 70
    ELSE 50
  END,
  'pending',
  NULL
FROM podcasts p
WHERE p.rank_label IN ('S','A','B','C')
  AND (p.rss_status IS NULL OR p.rss_status IN ('active','not_checked'))
  AND p.seo_description IS NOT NULL
  AND length(p.seo_description) < 80
ON CONFLICT (kind, target_type, target_id, input_hash) DO NOTHING;