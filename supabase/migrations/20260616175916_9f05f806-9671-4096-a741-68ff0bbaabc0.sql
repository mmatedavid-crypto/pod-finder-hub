-- Cost audit 2026-06-16: reduce idle/wasteful cron frequency.
-- Findings:
--  * jobid 38 process-email-queue: 288 runs/day, 0 emails sent in 30 days → hourly
--  * jobid 4  queue-drainer: 144 runs/day, discovery_queue pending=0 → */30
--  * jobid 21 homepage-feed-refresh: 48 runs/day, ~5s each (heavy MV refresh) → hourly
--  * jobid 51 purge-non-en-drain: 96 runs/day @ 4.4s avg (446k eps backlog) → */30 keeps draining at half cost
SELECT cron.alter_job(job_id => 38, schedule => '0 * * * *');
SELECT cron.alter_job(job_id => 4,  schedule => '*/30 * * * *');
SELECT cron.alter_job(job_id => 21, schedule => '0 * * * *');
SELECT cron.alter_job(job_id => 51, schedule => '*/30 * * * *');