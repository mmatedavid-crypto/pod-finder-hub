// Auto-discovers new company entities (≥3 episodes across ≥2 podcasts) and refreshes
// existing company profiles when new episodes mention them.
// Budget-capped, kill-switch aware, sequential to limit AI fanout.
// Mirrors entity-profile-runner (which handles person kind).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_MAX_NEW = 25;
const DEFAULT_MAX_REFRESH = 15;
const DEFAULT_DAILY_BUDGET_USD = 1.0;
const KIND_BUDGET = "entity_profile_company";

async function checkKill(sb: any): Promise<boolean> {
  const { data } = await sb.from("app_settings").select("value").eq("key", "background_jobs").maybeSingle();
  return data?.value?.paused !== true;
}

async function spendToday(sb: any): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await sb.from("ai_spend_daily").select("by_kind").eq("day", day).maybeSingle();
  const v = data?.by_kind?.[KIND_BUDGET];
  return typeof v === "number" ? v : 0;
}

async function recordSpend(sb: any, cost: number) {
  if (!cost || cost <= 0) return;
  const day = new Date().toISOString().slice(0, 10);
  const { data: row } = await sb.from("ai_spend_daily").select("spend_usd, calls, by_kind").eq("day", day).maybeSingle();
  const prevKind = (row?.by_kind ?? {}) as Record<string, number>;
  prevKind[KIND_BUDGET] = (prevKind[KIND_BUDGET] ?? 0) + cost;
  await sb.from("ai_spend_daily").upsert({
    day,
    spend_usd: (row?.spend_usd ?? 0) + cost,
    calls: (row?.calls ?? 0) + 1,
    by_kind: prevKind,
    updated_at: new Date().toISOString(),
  }, { onConflict: "day" });
}

async function fetchWikiThumb(name: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`;
    const r = await fetch(url, { headers: { "User-Agent": "PodiverzumBot/1.0 (https://podiverzum.com)" } });
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.type === "disambiguation") return null;
    return j?.thumbnail?.source || j?.originalimage?.source || null;
  } catch { return null; }
}

async function generate(slug: string, _displayName: string | null, force: boolean): Promise<{ ok: boolean; cost?: number; error?: string }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/entity-profile-generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ kind: "company", slug, force }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j?.error || `HTTP ${r.status}` };
    return { ok: true, cost: typeof j?.cost_usd === "number" ? j.cost_usd : 0 };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    if (!(await checkKill(sb))) {
      return new Response(JSON.stringify({ ok: false, skipped: "paused" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const maxNew = Number(body.max_new ?? DEFAULT_MAX_NEW);
    const maxRefresh = Number(body.max_refresh ?? DEFAULT_MAX_REFRESH);
    const budget = Number(body.daily_budget_usd ?? DEFAULT_DAILY_BUDGET_USD);
    const minCount = Number(body.min_count ?? 3);
    const minPods = Number(body.min_pods ?? 2);

    const startSpend = await spendToday(sb);
    let spend = startSpend;
    if (spend >= budget) {
      return new Response(JSON.stringify({ ok: true, skipped: "budget", spend }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const stats = { refreshed: 0, refresh_errors: 0, created: 0, create_errors: 0, wiki_hits: 0, spend_added: 0 };

    // ---- REFRESH PASS ----
    const { data: refreshCands, error: refErr } = await sb.rpc("select_company_refresh_candidates", { _limit: maxRefresh });
    if (refErr) throw refErr;
    for (const r of (refreshCands || []) as any[]) {
      if (spend >= budget) break;
      const res = await generate(r.slug, r.display_name, true);
      if (res.ok) {
        stats.refreshed++;
        if (res.cost) { spend += res.cost; await recordSpend(sb, res.cost); }
      } else {
        stats.refresh_errors++;
        console.error("refresh", r.slug, res.error);
      }
    }

    // ---- DISCOVERY PASS ----
    const { data: newCands, error: newErr } = await sb.rpc("select_company_candidates", {
      _min_count: minCount, _min_pods: minPods, _limit: maxNew,
    });
    if (newErr) throw newErr;

    const newSlugs: string[] = [];
    const newUrls: string[] = [];
    for (const c of (newCands || []) as any[]) {
      if (spend >= budget) break;
      // Insert stub so generator can find display_name
      const { error: stubErr } = await sb.from("entity_profiles").upsert({
        kind: "company",
        slug: c.slug,
        display_name: c.display_name,
        generated_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      }, { onConflict: "kind,slug", ignoreDuplicates: true });
      if (stubErr) { stats.create_errors++; console.error("stub", c.slug, stubErr); continue; }

      const res = await generate(c.slug, c.display_name, true);
      if (res.ok) {
        stats.created++;
        if (res.cost) { spend += res.cost; await recordSpend(sb, res.cost); }
        const thumb = await fetchWikiThumb(c.display_name);
        if (thumb) { newSlugs.push(c.slug); newUrls.push(thumb); stats.wiki_hits++; }
      } else {
        stats.create_errors++;
        console.error("create", c.slug, res.error);
      }
    }

    if (newSlugs.length) {
      const { error: imgErr } = await sb.rpc("admin_update_entity_images_by_kind", { p_kind: "company", p_slugs: newSlugs, p_urls: newUrls });
      if (imgErr) console.error("images", imgErr);
    }

    stats.spend_added = +(spend - startSpend).toFixed(4);
    return new Response(JSON.stringify({ ok: true, stats, spend_today: spend, budget }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("company-runner", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
