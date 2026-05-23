
-- Lock down internal operational tables: remove public read policies.
-- Service-role edge functions bypass RLS; admins retain access via existing "admin write" ALL policies.

DROP POLICY IF EXISTS "ai_spend public read" ON public.ai_spend_daily;
DROP POLICY IF EXISTS "runs public read" ON public.growth_runs;
DROP POLICY IF EXISTS "pi_dump_imports public read" ON public.pi_dump_imports;
DROP POLICY IF EXISTS "pi_feed_staging public read" ON public.pi_feed_staging;
DROP POLICY IF EXISTS "rss_url_history public read" ON public.rss_url_history;
DROP POLICY IF EXISTS "ai_jobs public read" ON public.ai_enrichment_jobs;
DROP POLICY IF EXISTS "queue public read" ON public.discovery_queue;
DROP POLICY IF EXISTS "social_posts public read" ON public.social_posts;

-- app_settings: replace broad public read with whitelist of keys used by the public frontend.
DROP POLICY IF EXISTS "settings public read" ON public.app_settings;

CREATE POLICY "settings public read whitelist"
ON public.app_settings
FOR SELECT
USING (key IN ('search_suggestions', 'smart_player'));
