
-- Cost optimization 2026-06-06: cut wasteful per-minute cron runs.
-- All these are background drains/audits; their work is not real-time critical.
-- Estimated saving: ~7500 fewer edge function invocations per day.

-- 1. queue-drainer: per-minute -> every 10 min (matches its original name)
SELECT cron.alter_job(job_id := 4,  schedule := '*/10 * * * *');

-- 2. title-cleanup: every 2 min -> hourly
SELECT cron.alter_job(job_id := 10, schedule := '0 * * * *');

-- 3. formula-c-runner: every 2 min -> every 15 min
SELECT cron.alter_job(job_id := 19, schedule := '*/15 * * * *');

-- 4. episode-dedup: per-minute -> every 15 min
SELECT cron.alter_job(job_id := 32, schedule := '*/15 * * * *');

-- 5. embed-cleanup-audit-drain: per-minute -> weekly (Sun 04:00 UTC)
SELECT cron.alter_job(job_id := 46, schedule := '0 4 * * 0');

-- 6. queue-health-controller: unschedule (merged into pipeline-watchdog jobid 48, which runs */5)
SELECT cron.unschedule(50);

-- 7. purge-non-en-drain: per-minute -> every 15 min (still has ~446k rows to drain)
SELECT cron.alter_job(job_id := 51, schedule := '*/15 * * * *');
