
SELECT cron.schedule(
  'tiktok-generate-daily',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iqzkayoqqagowvxeaphe.supabase.co/functions/v1/tiktok-generate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
