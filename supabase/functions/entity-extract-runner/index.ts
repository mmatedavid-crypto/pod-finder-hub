// Drains ai_enrichment_jobs (kind = entity_episode).
// Extracts people/companies/tickers/topics from S/A-tier English episodes via Gemini.
// Mirrors seo-enrich-runner architecture: direct Gemini API, token-bucket rate gate,
// daily $ budget, claim-by-kind, adaptive cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkBackgroundJobsAllowed } from "../_shared/incident-guard.ts";
import { ENTITY_SYSTEM_PROMPT, ENTITY_TOOL, entityUserPrompt, postProcessPeople } from "../_shared/entity-prompt.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Rough Gemini Flash Lite pricing.
const PRICE_IN_PER_1K = 0.000075;
const PRICE_OUT_PER_1K = 0.0003;

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

function directModelName(model: string): string {
  let m = model.replace(/^google\//, "");
  if (m === "gemini-3.1-flash-lite-preview") m = "gemini-2.5-flash-lite";
  if (m === "gemini-3-flash-preview") m = "gemini-2.5-flash";
  return m;
}

let __rateBucket: { window: number; count: number } = { window: 0, count: 0 };
async function rateGate(maxPerSec: number) {
  while (true) {
    const now = Date.now();
    const w = Math.floor(now / 1000);
    if (w !== __rateBucket.window) { __rateBucket = { window: w, count: 0 }; }
    if (__rateBucket.count < maxPerSec) { __rateBucket.count++; return; }
    await new Promise((r) => setTimeout(r, 1000 - (now % 1000) + 5));
  }
}

function toGeminiTool(openAiTool: any) {
  const f = openAiTool.function;
  const stripExtras = (s: any): any => {
    if (!s || typeof s !== "object") return s;
    const { additionalProperties, ...rest } = s;
    if (rest.properties) {
      const np: any = {};
      for (const [k, v] of Object.entries(rest.properties)) np[k] = stripExtras(v);
      rest.properties = np;
    }
    return rest;
  };
  return { functionDeclarations: [{ name: f.name, description: f.description, parameters: stripExtras(f.parameters) }] };
}

async function callAIDirect(model: string, systemPrompt: string, userPrompt: string, openAiTool: any, toolName: string) {
  const m = directModelName(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${GEMINI_API_KEY}`;
  const tool = toGeminiTool(openAiTool);
  const body = {
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    tools: [tool],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [toolName] } },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 429) throw new Error("rate_limited");
  if (res.status >= 500) throw new Error(`ai_${res.status}`);
  if (!res.ok) throw new Error(`ai_${res.status}`);
  const j = await res.json();
  const fc = j.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;
  if (!fc) throw new Error("no_tool_call");
  return {
    choices: [{ message: { tool_calls: [{ function: { name: fc.name, arguments: JSON.stringify(fc.args || {}) } }] } }],
    usage: { prompt_tokens: j.usageMetadata?.promptTokenCount || 0, completion_tokens: j.usageMetadata?.candidatesTokenCount || 0 },
  };
}

async function callAIGateway(model: string, messages: any[], tools: any[], toolName: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, tools, tool_choice: { type: "function", function: { name: toolName } } }),
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (res.status === 402) throw new Error("budget_exhausted_provider");
  if (!res.ok) throw new Error(`ai_${res.status}`);
  return res.json();
}

async function callAI(model: string, systemPrompt: string, userPrompt: string, openAiTool: any, toolName: string, maxRps: number) {
  if (GEMINI_API_KEY) {
    await rateGate(maxRps);
    try {
      return await callAIDirect(model, systemPrompt, userPrompt, openAiTool, toolName);
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.startsWith("ai_5")) {
        return await callAIGateway(model, [
          { role: "system", content: systemPrompt }, { role: "user", content: userPrompt },
        ], [openAiTool], toolName);
      }
      throw e;
    }
  }
  return await callAIGateway(model, [
    { role: "system", content: systemPrompt }, { role: "user", content: userPrompt },
  ], [openAiTool], toolName);
}

// Normalize entity arrays: trim, dedupe (case-insensitive), cap length.
function normArr(raw: unknown, max: number, opts: { upper?: boolean; lower?: boolean } = {}): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    let s = v.replace(/\s+/g, " ").trim();
    if (!s || s.length > 80) continue;
    if (opts.upper) s = s.toUpperCase();
    if (opts.lower) s = s.toLowerCase();
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 110_000;

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const __guard = await checkBackgroundJobsAllowed(admin, "entity-extract-runner");
    if (__guard.blocked) return json({ ok: true, skipped: true, reason: __guard.reason });
    const body = await req.json().catch(() => ({}));
    const batch = Math.max(1, Math.min(200, Number(body.batch) || 100));
    const concurrency = Math.max(1, Math.min(80, Number(body.concurrency) || (GEMINI_API_KEY ? 30 : 10)));
    const maxRps = Math.max(1, Math.min(120, Number(body.max_rps) || 30));
    const enqueue_top_up = Math.max(0, Math.min(2000, Number(body.enqueue_top_up) || 1000));

    // Controls
    const { data: ctrlRow } = await admin.from("app_settings").select("value").eq("key", "ai_entity_controls").maybeSingle();
    const ctrl = (ctrlRow?.value || {}) as any;
    if (ctrl.enabled === false) return json({ ok: true, paused: true });
    const dailyBudget = Number(ctrl.daily_budget_usd ?? 0.5);
    const model = String(ctrl.model || "google/gemini-2.5-flash-lite");
    const maxAttempts = Number(ctrl.max_attempts || 3);

    // Today's spend (shared bucket; entity adds to ai_spend_daily)
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const dayKey = today.toISOString().slice(0, 10);
    const { data: spendRow } = await admin.from("ai_spend_daily").select("*").eq("day", dayKey).maybeSingle();
    let spend = Number(spendRow?.spend_usd || 0);
    let calls = Number(spendRow?.calls || 0);
    const byKind = { ...(spendRow?.by_kind as any || {}) };
    let entitySpend = Number(byKind.entity_episode || 0);
    if (entitySpend >= dailyBudget) return json({ ok: true, budget_reached: true, entity_spend: entitySpend });

    // Top up backlog (no-op if already plenty pending).
    let enqueued = 0;
    try {
      const { count: pending } = await admin.from("ai_enrichment_jobs").select("id", { count: "exact", head: true })
        .eq("kind", "entity_episode").eq("status", "pending");
      if ((pending || 0) < 500 && enqueue_top_up > 0) {
        const { data: n } = await admin.rpc("entity_extract_enqueue" as any, { _limit: enqueue_top_up });
        enqueued = Number(n) || 0;
      }
    } catch { /* noop */ }

    // Reap stale locks (re-use existing helper).
    let reaped_stale_locks = 0;
    try {
      const { data: r } = await admin.rpc("reap_ai_stale_locks", { _older_than_minutes: 5 });
      reaped_stale_locks = Number(r) || 0;
    } catch { /* noop */ }

    let processed = 0, succeeded = 0, failed = 0, rate_limited = 0;
    let stop = false;
    let total_claimed = 0;
    let drain_loops = 0;
    const TAIL_RESERVE_MS = 5_000;

    const runJob = async (job: any) => {
      if (stop) return;
      if (Date.now() - startedAt > TIME_BUDGET_MS) { stop = true; return; }
      if (entitySpend >= dailyBudget) {
        await admin.from("ai_enrichment_jobs").update({ status: "pending", locked_until: null }).eq("id", job.id);
        return;
      }
      processed++;
      try {
        const { data: e } = await admin.from("episodes")
          .select("id,title,display_title,description,summary,ai_summary,podcasts!inner(title,display_title)")
          .eq("id", job.target_id).maybeSingle();
        if (!e) throw new Error("target_missing");
        const podName = ((e as any).podcasts?.display_title) || ((e as any).podcasts?.title) || "";
        const prompt = entityUserPrompt(e as any, podName);

        const ai = await callAI(model, ENTITY_SYSTEM_PROMPT, prompt, ENTITY_TOOL, "extract_entities", maxRps);
        const usage = ai.usage || {};
        const inTok = Number(usage.prompt_tokens || 0);
        const outTok = Number(usage.completion_tokens || 0);
        const cost = (inTok / 1000) * PRICE_IN_PER_1K + (outTok / 1000) * PRICE_OUT_PER_1K;

        const args = ai.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        const parsed = args ? JSON.parse(args) : null;
        if (!parsed) throw new Error("no_tool_call");

        // v2: structured role-aware people with title-pattern + confidence post-check.
        const title = (e as any).display_title || (e as any).title || "";
        const { people_roles, people } = postProcessPeople(parsed.people, { title, podcast_title: podName });
        const companies = normArr(parsed.companies, 8);
        const tickers = normArr(parsed.tickers, 6, { upper: true });
        const topics = normArr(parsed.topics, 7, { lower: true });

        await admin.from("episodes").update({
          people, companies, tickers, topics,
          people_roles,
          ai_entities_version: 2,
        }).eq("id", job.target_id);

        await admin.from("ai_enrichment_jobs").update({
          status: "done",
          completed_at: new Date().toISOString(),
          model, cost_usd: cost, input_tokens: inTok, output_tokens: outTok,
          result: { parsed: { people: people.length, roles: people_roles.map((p) => p.role), companies: companies.length, tickers: tickers.length, topics: topics.length } },
          last_error: null,
        }).eq("id", job.id);

        succeeded++;
        spend += cost; entitySpend += cost; calls++;
      } catch (err: any) {
        failed++;
        const msg = err?.message || "error";
        if (msg === "budget_exhausted_provider") { rate_limited++; stop = true; }
        else if (msg === "rate_limited") {
          rate_limited++;
          if (rate_limited > concurrency * 3) stop = true;
        }
        const giveUp = (job.attempts || 0) >= maxAttempts;
        await admin.from("ai_enrichment_jobs").update({
          status: giveUp ? "failed" : "pending",
          locked_until: null,
          last_error: msg,
        }).eq("id", job.id);
      }
    };

    while (!stop) {
      if (Date.now() - startedAt > TIME_BUDGET_MS - TAIL_RESERVE_MS) break;
      if (entitySpend >= dailyBudget) break;

      const { data: claimed, error: cErr } = await admin.rpc("claim_ai_jobs_by_kinds" as any, {
        _kinds: ["entity_episode"], _limit: batch, _lock_seconds: 120,
      });
      if (cErr) throw cErr;
      const jobs = (claimed || []) as any[];
      if (!jobs.length) break;
      total_claimed += jobs.length;
      drain_loops++;

      let i = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
          const idx = i++;
          if (idx >= jobs.length || stop) return;
          if (Date.now() - startedAt > TIME_BUDGET_MS - TAIL_RESERVE_MS) { stop = true; return; }
          await runJob(jobs[idx]);
        }
      });
      await Promise.all(workers);
    }

    // Update daily spend (shared row + per-kind breakdown).
    byKind.entity_episode = entitySpend;
    await admin.from("ai_spend_daily").upsert({
      day: dayKey, spend_usd: spend, calls,
      by_kind: byKind,
      updated_at: new Date().toISOString(),
    });

    // Auto-pause if entity budget reached.
    if (entitySpend >= dailyBudget) {
      const newCtrl = { ...ctrl, enabled: false, auto_paused_reason: "daily_budget_reached", auto_paused_at: new Date().toISOString() };
      await admin.from("app_settings").upsert({ key: "ai_entity_controls", value: newCtrl, updated_at: new Date().toISOString() });
    }

    // Adaptive cron (steps: *, */2, */5, */10, */30).
    let next_schedule: string | null = null;
    try {
      const { count: pending } = await admin.from("ai_enrichment_jobs").select("id", { count: "exact", head: true })
        .eq("kind", "entity_episode").eq("status", "pending");
      const p = Number(pending || 0);
      if (rate_limited > 0) {
        if (p > 1000) next_schedule = "*/2 * * * *";
        else if (p > 100) next_schedule = "*/5 * * * *";
        else if (p >= 10) next_schedule = "*/10 * * * *";
        else next_schedule = "*/30 * * * *";
      } else {
        if (p > 200) next_schedule = "*/2 * * * *";
        else if (p > 20) next_schedule = "*/5 * * * *";
        else if (p >= 1) next_schedule = "*/10 * * * *";
        else next_schedule = "*/30 * * * *";
      }
      try { await admin.rpc("set_entity_extract_runner_schedule" as any, { _schedule: next_schedule }); } catch { /* ignore */ }
    } catch { /* ignore */ }

    return json({ ok: true, claimed: total_claimed, drain_loops, processed, succeeded, failed, rate_limited, enqueued, concurrency, entity_spend_usd: entitySpend, reaped_stale_locks, next_schedule, elapsed_ms: Date.now() - startedAt });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
