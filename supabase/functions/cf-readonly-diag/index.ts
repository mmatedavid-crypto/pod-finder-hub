// Admin-only, GET-only Cloudflare diagnostic for podiverzum.com.
// Never mutates Cloudflare; never returns the token, account IDs or record contents.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CF = "https://api.cloudflare.com/client/v4";
const ZONE = "podiverzum.com";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: claims, error: cErr } = await userClient.auth.getClaims(jwt);
  const uid = claims?.claims?.sub;
  if (cErr || !uid) return json({ error: "unauthorized" }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!token) return json({ error: "CLOUDFLARE_API_TOKEN missing" }, 500);
  const get = async (path: string) => {
    const r = await fetch(`${CF}${path}`, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, success: !!body?.success, errors: (body?.errors || []).map((e: any) => `${e.code}: ${e.message}`), result: body?.result };
  };

  const zones = await get(`/zones?name=${ZONE}`);
  const zone = Array.isArray(zones.result) ? zones.result[0] : null;
  const out: Record<string, unknown> = {
    zone_lookup: { status: zones.status, success: zones.success, errors: zones.errors, found: !!zone, zone_status: zone?.status, plan: zone?.plan?.name },
  };
  if (zone?.id) {
    const routes = await get(`/zones/${zone.id}/workers/routes`);
    out.worker_routes = {
      status: routes.status, success: routes.success, errors: routes.errors,
      routes: (routes.result || []).map((r: any) => ({ pattern: r.pattern, script: r.script ?? null })),
    };
    const dns = await get(`/zones/${zone.id}/dns_records?per_page=100`);
    out.dns = {
      status: dns.status, success: dns.success, errors: dns.errors,
      records: (dns.result || [])
        .filter((r: any) => ["A", "AAAA", "CNAME"].includes(r.type))
        .map((r: any) => ({ name: r.name, type: r.type, proxied: r.proxied })),
    };
  }
  return json(out);
});
