
-- jobid 4: queue-drainer — pending-gated POST + self-tune
SELECT cron.alter_job(
  job_id := 4,
  command := $cmd$
  WITH pending AS (
    SELECT count(*)::int AS n FROM public.discovery_queue WHERE status='pending'
  ),
  _tune AS (
    SELECT public.set_queue_drainer_schedule((SELECT n FROM pending))
  )
  SELECT CASE
    WHEN (SELECT n FROM pending) > 0 THEN
      net.http_post(
        url := 'https://iqzkayoqqagowvxeaphe.supabase.co/functions/v1/queue-drainer',
        headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxemtheW9xcWFnb3d2eGVhcGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDA3NzAsImV4cCI6MjA5MzU3Njc3MH0.KaeRcYcljGjrP_OAcTp_lapPSRsAYRq6gPJ2vYV7fz4","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxemtheW9xcWFnb3d2eGVhcGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDA3NzAsImV4cCI6MjA5MzU3Njc3MH0.KaeRcYcljGjrP_OAcTp_lapPSRsAYRq6gPJ2vYV7fz4"}'::jsonb,
        body := '{}'::jsonb
      )
    ELSE NULL
  END
  FROM _tune;
  $cmd$
);

-- jobid 38: process-email-queue — keep guard, add self-tune
SELECT cron.alter_job(
  job_id := 38,
  command := $cmd$
  WITH pending AS (
    SELECT (
      (SELECT count(*) FROM pgmq.q_auth_emails) +
      (SELECT count(*) FROM pgmq.q_transactional_emails)
    )::int AS n
  ),
  _tune AS (SELECT public.set_process_email_queue_schedule((SELECT n FROM pending)))
  SELECT CASE
    WHEN (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN NULL
    WHEN (SELECT n FROM pending) > 0 THEN
      net.http_post(
        url := 'https://iqzkayoqqagowvxeaphe.supabase.co/functions/v1/process-email-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'email_queue_service_role_key'
          )
        ),
        body := '{}'::jsonb
      )
    ELSE NULL
  END
  FROM _tune;
  $cmd$
);

-- jobid 51: purge-non-en-drain — run step then self-tune on remaining
SELECT cron.alter_job(
  job_id := 51,
  command := $cmd$
  WITH _step AS (SELECT public.purge_non_en_step(8000, 5000)),
       remaining AS (
         SELECT (
           (SELECT count(*) FROM public._purge_non_en_eps) +
           (SELECT count(*) FROM public._purge_non_en_pods)
         )::int AS n
       )
  SELECT public.set_purge_non_en_schedule((SELECT n FROM remaining)) FROM _step;
  $cmd$
);
