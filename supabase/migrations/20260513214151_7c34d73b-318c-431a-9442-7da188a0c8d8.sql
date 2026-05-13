
-- 1. x_watch_accounts
CREATE TABLE IF NOT EXISTS public.x_watch_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x_handle text NOT NULL UNIQUE,
  display_name text,
  person_slug text,
  default_podiverzum_url text,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 50,
  notes text,
  last_checked_at timestamptz,
  last_seen_post_id text,
  x_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.x_watch_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "x_watch_accounts admin all"
  ON public.x_watch_accounts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. x_watched_posts
CREATE TABLE IF NOT EXISTS public.x_watched_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x_post_id text NOT NULL UNIQUE,
  x_handle text NOT NULL,
  post_text text,
  post_url text NOT NULL,
  posted_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  matched_person_slug text,
  matched_topic text,
  matched_podiverzum_url text,
  relevance_score numeric,
  match_reason text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','ignored','needs_review','suggested','approved','posted','skipped','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS x_watched_posts_status_idx ON public.x_watched_posts (status, detected_at DESC);
CREATE INDEX IF NOT EXISTS x_watched_posts_handle_idx ON public.x_watched_posts (x_handle, posted_at DESC);
ALTER TABLE public.x_watched_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "x_watched_posts admin all"
  ON public.x_watched_posts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. x_reply_suggestions
CREATE TABLE IF NOT EXISTS public.x_reply_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watched_post_id uuid NOT NULL REFERENCES public.x_watched_posts(id) ON DELETE CASCADE,
  variant text,
  suggestion_text text NOT NULL,
  podiverzum_url text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','posted','rejected')),
  approved_at timestamptz,
  approved_by uuid,
  posted_at timestamptz,
  x_reply_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS x_reply_suggestions_post_idx ON public.x_reply_suggestions (watched_post_id, created_at DESC);
ALTER TABLE public.x_reply_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "x_reply_suggestions admin all"
  ON public.x_reply_suggestions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. x_reply_audit_log
CREATE TABLE IF NOT EXISTS public.x_reply_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watched_post_id uuid,
  suggestion_id uuid,
  action text NOT NULL,
  actor text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS x_reply_audit_created_idx ON public.x_reply_audit_log (created_at DESC);
ALTER TABLE public.x_reply_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "x_reply_audit_log admin all"
  ON public.x_reply_audit_log FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Touch updated_at trigger (reuse generic if it exists, else inline)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS x_watch_accounts_touch ON public.x_watch_accounts;
CREATE TRIGGER x_watch_accounts_touch BEFORE UPDATE ON public.x_watch_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS x_watched_posts_touch ON public.x_watched_posts;
CREATE TRIGGER x_watched_posts_touch BEFORE UPDATE ON public.x_watched_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS x_reply_suggestions_touch ON public.x_reply_suggestions;
CREATE TRIGGER x_reply_suggestions_touch BEFORE UPDATE ON public.x_reply_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
