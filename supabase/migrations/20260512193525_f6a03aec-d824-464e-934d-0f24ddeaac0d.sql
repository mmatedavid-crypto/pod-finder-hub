SELECT cron.alter_job(
  job_id := 12,
  command := $$
  select net.http_post(
    url:='https://iqzkayoqqagowvxeaphe.supabase.co/functions/v1/seo-enrich-runner',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxemtheW9xcWFnb3d2eGVhcGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDA3NzAsImV4cCI6MjA5MzU3Njc3MH0.KaeRcYcljGjrP_OAcTp_lapPSRsAYRq6gPJ2vYV7fz4"}'::jsonb,
    body:='{"batch":200,"concurrency":50,"max_rps":18,"fanout":8}'::jsonb
  );
  $$
);