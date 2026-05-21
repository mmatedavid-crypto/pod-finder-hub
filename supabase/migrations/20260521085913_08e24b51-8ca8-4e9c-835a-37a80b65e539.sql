SELECT cron.alter_job(
  job_id := 10,
  schedule := '*/2 * * * *',
  command := $$
  SELECT net.http_post(
    url:='https://iqzkayoqqagowvxeaphe.supabase.co/functions/v1/title-cleanup-runner',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxemtheW9xcWFnb3d2eGVhcGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDA3NzAsImV4cCI6MjA5MzU3Njc3MH0.KaeRcYcljGjrP_OAcTp_lapPSRsAYRq6gPJ2vYV7fz4',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxemtheW9xcWFnb3d2eGVhcGhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODAwMDc3MCwiZXhwIjoyMDkzNTc2NzcwfQ.u6uKYvh98UH71WYsXREbVrWS4Vf1sw7kzg-aQUoXlb4'
    ),
    body:=jsonb_build_object('trigger','cron','limit',2000,'time_budget_ms',110000)
  );
  $$
);