
CREATE TABLE IF NOT EXISTS public.ai_call_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  job_type text NOT NULL,
  provider text,
  key_source text,
  model_used text,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric,
  prompt_version text,
  source_hash text,
  confidence numeric,
  status text NOT NULL CHECK (status IN ('ok','error','skipped')),
  skipped_reason text,
  error_message text,
  latency_ms integer,
  target_type text,
  target_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_call_audit_created
  ON public.ai_call_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_audit_job_status_created
  ON public.ai_call_audit (job_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_audit_key_model_created
  ON public.ai_call_audit (key_source, model_used, created_at DESC);

ALTER TABLE public.ai_call_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_call_audit admin read"
  ON public.ai_call_audit FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ai_call_audit service write"
  ON public.ai_call_audit FOR INSERT
  WITH CHECK (true);
