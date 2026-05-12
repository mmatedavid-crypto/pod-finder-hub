-- Clear zombie 'done' jobs whose target episodes still lack ai_summary, plus failed jobs, so they re-enqueue with fresh hash.
DELETE FROM ai_enrichment_jobs j
USING episodes e
WHERE j.kind='seo_episode'
  AND j.target_id=e.id
  AND j.status='done'
  AND e.ai_summary IS NULL;

DELETE FROM ai_enrichment_jobs WHERE status='failed';