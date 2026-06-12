DO $$
DECLARE
  v_url text := 'https://iqzkayoqqagowvxeaphe.supabase.co';
  v_key text;
BEGIN
  -- 1) process-email-queue: 5s -> 5min
  PERFORM cron.alter_job(job_id := 38, schedule := '*/5 * * * *');

  -- 2) daily-social-post: every 30 min -> daily 14:00 UTC
  PERFORM cron.alter_job(job_id := 25, schedule := '0 14 * * *');

  -- 3) homepage-feed-refresh: */5 -> */30
  PERFORM cron.alter_job(job_id := 21, schedule := '*/30 * * * *');

  -- 4) pipeline-watchdog: */5 -> */10
  PERFORM cron.alter_job(job_id := 48, schedule := '*/10 * * * *');

  -- 5) incremental-refresh: */5 -> */10 (align with jobname)
  PERFORM cron.alter_job(job_id := 8, schedule := '*/10 * * * *');

  -- 6) deep-hydration: */10 -> */30 (align with jobname)
  PERFORM cron.alter_job(job_id := 7, schedule := '*/30 * * * *');

  -- 7) pi-dump-process: */30 -> hourly (adaptive re-tunes upward when backlog exists)
  PERFORM cron.alter_job(job_id := 28, schedule := '0 * * * *');
END $$;