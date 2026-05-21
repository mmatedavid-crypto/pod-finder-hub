// Admin API for watchdog: get state + status, toggle enabled/dry_run, resume runner, send test telegram.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendTelegram(text: string): Promise<{ ok: boolean; error?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  const CHAT_ID = Deno.env.get("TELEGRAM_ALERT_CHAT_ID");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !CHAT_ID) {
    return { ok: false, error: "missing_telegram_env" };
  }
  const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) return { ok: false, error: `telegram_${res.status}: ${(await res.text()).slice(0, 200)}` };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const userId = claims.claims.sub;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = body.action || "status";

  try {
    if (action === "status") {
      const { data: stateRow } = await admin.from("app_settings").select("value, updated_at").eq("key", "watchdog_state").maybeSingle();
      const state = (stateRow?.value || {}) as any;
      const runners: any[] = Array.isArray(state.runners) ? state.runners : [];

      // pull controls for all runners
      const ctrlKeys = runners.map((r) => r.controls_key).filter(Boolean);
      const { data: ctrls } = ctrlKeys.length
        ? await admin.from("app_settings").select("key,value").in("key", ctrlKeys)
        : { data: [] as any[] };
      const ctrlMap: Record<string, any> = {};
      (ctrls || []).forEach((c: any) => { ctrlMap[c.key] = c.value; });

      // budget caps + today spend
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: budgetRow }, { data: spendRow }] = await Promise.all([
        admin.from("app_settings").select("value").eq("key", "ai_budget").maybeSingle(),
        admin.from("ai_spend_daily").select("by_kind,spend_usd").eq("day", today).maybeSingle(),
      ]);
      const caps = (budgetRow?.value?.per_job_caps_usd || {}) as Record<string, number>;
      const byKind = (spendRow?.by_kind || {}) as Record<string, number>;

      // last run from audit
      const status = await Promise.all(runners.map(async (r) => {
        const { data: latest } = await admin.from("ai_call_audit").select("created_at").eq("job_type", r.spend_key).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const spend = Math.max(Number(byKind[`${r.spend_key}_usd`] || 0), Number(byKind[r.spend_key] || 0));
        const cap = Number(caps[r.spend_key] || 0);
        const ctrl = r.controls_key ? ctrlMap[r.controls_key] : null;
        return {
          name: r.name,
          spend_key: r.spend_key,
          controls_key: r.controls_key || null,
          enabled: ctrl ? ctrl.enabled !== false : null,
          paused_by: ctrl?.paused_by || null,
          last_run_at: latest?.created_at || null,
          spend_usd: spend,
          budget_usd: cap,
        };
      }));

      const { data: events } = await admin.from("watchdog_events").select("*").order("created_at", { ascending: false }).limit(50);

      return new Response(JSON.stringify({ ok: true, state, status, events: events || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "set_state") {
      const patch = body.patch || {};
      const { data: cur } = await admin.from("app_settings").select("value").eq("key", "watchdog_state").maybeSingle();
      const next = { ...(cur?.value || {}), ...patch };
      await admin.from("app_settings").upsert({ key: "watchdog_state", value: next });
      return new Response(JSON.stringify({ ok: true, state: next }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "resume_runner") {
      const ctrlKey = String(body.controls_key || "");
      if (!ctrlKey) return new Response(JSON.stringify({ error: "controls_key required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: cur } = await admin.from("app_settings").select("value").eq("key", ctrlKey).maybeSingle();
      const next = { ...(cur?.value || {}), enabled: true, paused_by: null, paused_at: null, resumed_at: new Date().toISOString(), resumed_by: userId };
      await admin.from("app_settings").upsert({ key: ctrlKey, value: next });
      return new Response(JSON.stringify({ ok: true, controls: next }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "test_telegram") {
      const r = await sendTelegram(`✅ <b>pipeline-watchdog</b> test message from admin (${new Date().toISOString()})`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "run_now") {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pipeline-watchdog`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
        body: JSON.stringify({ trigger: "admin" }),
      });
      const out = await r.json().catch(() => ({ ok: false }));
      return new Response(JSON.stringify({ ok: r.ok, result: out }), { status: r.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as any)?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
