SELECT cron.schedule(
  'cleanup-ai-call-audit-weekly',
  '30 3 * * 1',
  $$ SELECT public.cleanup_ai_call_audit(); $$
);