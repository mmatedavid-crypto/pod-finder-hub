
CREATE TABLE IF NOT EXISTS public._purge_non_en_pods (id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS public._purge_non_en_eps  (id uuid PRIMARY KEY);
ALTER TABLE public._purge_non_en_pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._purge_non_en_eps  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purge admin" ON public._purge_non_en_pods FOR ALL USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "purge admin" ON public._purge_non_en_eps  FOR ALL USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
