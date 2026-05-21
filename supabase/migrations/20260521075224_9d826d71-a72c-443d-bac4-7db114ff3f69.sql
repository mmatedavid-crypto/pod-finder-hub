CREATE OR REPLACE FUNCTION public.cleanup_ai_call_audit()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.ai_call_audit
  WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ai_call_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_ai_call_audit() TO postgres, service_role;