UPDATE public.app_settings
SET value = jsonb_set(
  value,
  '{runners}',
  (SELECT jsonb_agg(
    CASE WHEN r->>'name'='daily_social_post'
      THEN r || '{"progress_key":"daily_social_post_progress"}'::jsonb
      ELSE r END
  ) FROM jsonb_array_elements(value->'runners') r)
)
WHERE key='watchdog_state';

INSERT INTO public.app_settings(key, value)
VALUES ('daily_social_post_progress', jsonb_build_object('last_run_at', now()::text))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;