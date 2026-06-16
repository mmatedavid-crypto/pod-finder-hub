
CREATE OR REPLACE FUNCTION public.set_process_email_queue_schedule(pending_count integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE desired text; current_sched text; jid bigint;
BEGIN
  IF pending_count > 500 THEN desired := '* * * * *';
  ELSIF pending_count >= 51 THEN desired := '*/5 * * * *';
  ELSIF pending_count >= 1 THEN desired := '*/15 * * * *';
  ELSE desired := '0 * * * *';
  END IF;
  IF desired NOT IN ('* * * * *','*/5 * * * *','*/15 * * * *','0 * * * *') THEN
    RAISE EXCEPTION 'invalid schedule %', desired;
  END IF;
  SELECT jobid, schedule INTO jid, current_sched FROM cron.job WHERE jobname='process-email-queue';
  IF jid IS NULL THEN RETURN 'no_job'; END IF;
  IF current_sched = desired THEN RETURN desired; END IF;
  PERFORM cron.alter_job(job_id := jid, schedule := desired);
  RETURN desired;
END; $$;

CREATE OR REPLACE FUNCTION public.set_queue_drainer_schedule(pending_count integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE desired text; current_sched text; jid bigint;
BEGIN
  IF pending_count > 100 THEN desired := '*/10 * * * *';
  ELSIF pending_count >= 1 THEN desired := '*/30 * * * *';
  ELSE desired := '0 * * * *';
  END IF;
  IF desired NOT IN ('*/10 * * * *','*/30 * * * *','0 * * * *') THEN
    RAISE EXCEPTION 'invalid schedule %', desired;
  END IF;
  SELECT jobid, schedule INTO jid, current_sched FROM cron.job WHERE jobname='queue-drainer-every-10-min';
  IF jid IS NULL THEN RETURN 'no_job'; END IF;
  IF current_sched = desired THEN RETURN desired; END IF;
  PERFORM cron.alter_job(job_id := jid, schedule := desired);
  RETURN desired;
END; $$;

CREATE OR REPLACE FUNCTION public.set_purge_non_en_schedule(pending_count integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE desired text; current_sched text; jid bigint;
BEGIN
  IF pending_count > 1000 THEN desired := '*/15 * * * *';
  ELSIF pending_count >= 1 THEN desired := '*/30 * * * *';
  ELSE desired := '0 * * * *';
  END IF;
  IF desired NOT IN ('*/15 * * * *','*/30 * * * *','0 * * * *') THEN
    RAISE EXCEPTION 'invalid schedule %', desired;
  END IF;
  SELECT jobid, schedule INTO jid, current_sched FROM cron.job WHERE jobname='purge-non-en-drain';
  IF jid IS NULL THEN RETURN 'no_job'; END IF;
  IF current_sched = desired THEN RETURN desired; END IF;
  PERFORM cron.alter_job(job_id := jid, schedule := desired);
  RETURN desired;
END; $$;

REVOKE ALL ON FUNCTION public.set_process_email_queue_schedule(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_queue_drainer_schedule(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_purge_non_en_schedule(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_process_email_queue_schedule(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_queue_drainer_schedule(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_purge_non_en_schedule(integer) TO service_role;
