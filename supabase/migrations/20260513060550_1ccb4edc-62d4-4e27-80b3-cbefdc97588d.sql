-- Phase 1: wind down 48h sprint cron schedules to steady-state
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='podiverzum-seo-enrich-enqueue-hourly'), schedule := '*/15 * * * *');
SELECT cron.alter_job(7,  schedule := '*/10 * * * *');   -- deep-hydrate-runner
SELECT cron.alter_job(10, schedule := '0 * * * *');      -- title-cleanup hourly
SELECT cron.alter_job(12, schedule := '*/5 * * * *',     -- seo-enrich-runner: dial fanout 8→4, daily budget cue
  command := replace(
    (SELECT command FROM cron.job WHERE jobid=12),
    '"fanout":8','"fanout":4'
  ));

-- Drop sprint AI budget back to launch-ready level + revert model preview override
UPDATE app_settings
SET value = jsonb_set(
  jsonb_set(value, '{daily_budget_usd}', '5'::jsonb),
  '{note}', '"Steady state post-sprint 2026-05-13. Was 100 during 48h drain."'::jsonb
)
WHERE key='ai_seo_controls';