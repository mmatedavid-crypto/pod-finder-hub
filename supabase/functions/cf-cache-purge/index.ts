// One-off admin: purge the Cloudflare edge cache for the podiverzum.com zone.
// POST { urls?: string[], purge_everything?: boolean }
// Auth: requires header `x-admin-secret` matching FORMULA_C_RUNNER_SECRET (reuse).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CF_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
const ADMIN_SECRET = Deno.env.get("FORMULA_C_RUNNER_SECRET")!;
const ZONE_NAME = "podiverzum.com";

async function getZoneId(): Promise<string> {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}`,
    { headers: { Authorization: `Bearer ${CF_TOKEN}` } },
  );
  const j = await r.json();
  if (!j.success || !j.result?.[0]?.id) {
    throw new Error(`zone lookup failed: ${JSON.stringify(j)}`);
  }
  return j.result[0].id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.headers.get("x-admin-secret") !== ADMIN_SECRET) {
    return new Response("unauthorized", { status: 401, headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const zoneId = await getZoneId();
    const payload = body.purge_everything
      ? { purge_everything: true }
      : { files: body.urls ?? [] };
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    const j = await r.json();
    return new Response(JSON.stringify({ ok: j.success === true, cf: j, zoneId }), {
      status: r.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
