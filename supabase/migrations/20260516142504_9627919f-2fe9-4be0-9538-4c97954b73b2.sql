
SELECT cron.schedule(
  'entity-profile-company-runner-daily',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iqzkayoqqagowvxeaphe.supabase.co/functions/v1/entity-profile-company-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('max_new', 25, 'max_refresh', 15, 'daily_budget_usd', 1.0)
  );
  $$
);
