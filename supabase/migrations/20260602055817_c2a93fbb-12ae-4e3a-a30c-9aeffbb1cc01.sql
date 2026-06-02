-- 1) Disable the ai-feed-scout cron via the official helper
DO $$
DECLARE jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE command ILIKE '%ai-feed-scout%' AND active
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

-- 2) Mark ai_feed_scout as intentionally skipped in watchdog
UPDATE app_settings
SET value = jsonb_set(
  value, '{runners}',
  (SELECT jsonb_agg(
     CASE WHEN r->>'name' = 'ai_feed_scout'
       THEN r || jsonb_build_object('skip', true, 'skip_reason', 'paused — backlog priority, avoid wasteful Gemini discovery')
       ELSE r END)
   FROM jsonb_array_elements(value->'runners') r)
),
updated_at = now()
WHERE key = 'watchdog_state';