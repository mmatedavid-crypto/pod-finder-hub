// One-shot backfill driver. Calls backfill RPCs in a loop until done.
// POST with {phase:"done"|"pending"|"skipped", batch:5000, max_seconds:50}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const started = Date.now();
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const phase = String(body.phase || "done");
    const batch = Math.max(100, Math.min(20000, Number(body.batch) || 5000));
    const maxSec = Math.max(10, Math.min(110, Number(body.max_seconds) || 100));
    const rpc =
      phase === "pending" ? "backfill_desc_chunk_status_pending" :
      phase === "skipped" ? "backfill_desc_chunk_status_skipped" :
      "backfill_desc_chunk_status_done";

    let totalUpdated = 0;
    let calls = 0;
    while ((Date.now() - started) / 1000 < maxSec) {
      const { data, error } = await admin.rpc(rpc as any, { _limit: batch });
      if (error) throw error;
      const n = Number(data || 0);
      calls++;
      totalUpdated += n;
      if (n === 0) break;
    }

    const { data: stats } = await admin.rpc("description_chunk_drain_stats" as any);
    return json({ ok: true, phase, batch, calls, total_updated: totalUpdated, elapsed_s: (Date.now() - started) / 1000, stats });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
