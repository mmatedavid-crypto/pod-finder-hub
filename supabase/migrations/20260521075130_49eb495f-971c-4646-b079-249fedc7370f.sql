UPDATE public.app_settings
SET value = jsonb_build_object(
  'daily_total_cap_usd', 8,
  'per_job_caps_usd', jsonb_build_object(
    'embed_episode', 3,
    'embed_description', 1,
    'embed_podcast', 1,
    'seo_enrich', 1,
    'categorize', 1,
    'entity_extract', 0.5,
    'ai_feed_scout', 1,
    'daily_social', 0.5,
    'mood', 0.3,
    'search_hyde', 0.3
  ),
  'block_pro', true,
  'block_gemini3', true,
  'audit_required', true,
  'allowlist_models', jsonb_build_array(
    'google/gemini-embedding-001',
    'google/text-embedding-004',
    'google/gemini-2.5-flash',
    'google/gemini-2.5-flash-lite'
  )
),
updated_at = now()
WHERE key = 'ai_budget';