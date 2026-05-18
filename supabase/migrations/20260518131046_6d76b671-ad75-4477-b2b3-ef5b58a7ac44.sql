UPDATE public.app_settings
SET value = jsonb_build_object(
  'enabled', true,
  'show_on_public_episode_pages', true,
  'dev_preview_enabled', true,
  'show_taste_buttons', false,
  'show_semantic_queue', false
),
updated_at = now()
WHERE key = 'smart_player';