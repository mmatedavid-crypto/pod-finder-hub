// Drains ai_enrichment_jobs (kind = seo_podcast | seo_episode).
// - Respects pause flag and daily $ budget cap.
// - Caches by input_hash (already enforced via unique index at enqueue time).
// - Up to 3 retries (max_attempts).
// - Writes seo_title/seo_description (and ai_summary for episodes).
// - Never overwrites title or description.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkBackgroundJobsAllowed } from "../_shared/incident-guard.ts";
import { SYSTEM_PROMPT, PODCAST_SEO_TOOL, EPISODE_SEO_TOOL, podcastUserPrompt, episodeUserPrompt } from "../_shared/seo-prompt.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Rough Gemini Flash pricing for budget gauge ($/1k tokens).
const PRICE_IN_PER_1K = 0.000075;
const PRICE_OUT_PER_1K = 0.0003;

// Google Gemini direct API key — when present, bypass Lovable Gateway entirely
// (separate rate-limit pool: free tier ~4000 RPM / 4M TPM on flash-lite).
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

// Map a runner model id to direct Gemini model name (strip provider prefix +
// drop the "-preview" suffix that the Gateway uses for the 3.1 lite preview).
function directModelName(model: string): string {
  let m = model.replace(/^google\//, "");
  // 3.1 flash-lite preview → fall back to stable 2.5-flash-lite via direct API
  // (the 3.1 preview is gateway-only). Same prompt cost; same quality tier.
  if (m === "gemini-3.1-flash-lite-preview") m = "gemini-2.5-flash-lite";
  if (m === "gemini-3-flash-preview") m = "gemini-2.5-flash";
  return m;
}

// Token-bucket rate limiter: cap ~60 req/sec across all in-flight workers
// inside a single edge invocation (3600 RPM target, safety margin under 4000).
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

// Convert OpenAI-style tool to Gemini native function declaration.
function toGeminiTool(openAiTool: any) {
  const f = openAiTool.function;
  // Strip "additionalProperties" — Gemini's schema validator rejects it.
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

// Direct Gemini API call. Returns a faked OpenAI-shaped response so the rest
// of the runner code (which reads choices[0].message.tool_calls[0]…) works
// unchanged. Throws "rate_limited" on 429, "ai_5xx" on transient server errors.
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
  // Re-shape into OpenAI completion format
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

// Unified entry: prefer direct Gemini, fall back to Gateway on 5xx.
async function callAI(model: string, systemPrompt: string, userPrompt: string, openAiTool: any, toolName: string, maxRps: number) {
  if (GEMINI_API_KEY) {
    await rateGate(maxRps);
    try {
      return await callAIDirect(model, systemPrompt, userPrompt, openAiTool, toolName);
    } catch (e: any) {
      const msg = e?.message || "";
      // Only fall back to Gateway on transient server errors, not on 429/no_tool_call
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 110_000;

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const __guard = await checkBackgroundJobsAllowed(admin, "seo-enrich-runner");
    if (__guard.blocked) return new Response(JSON.stringify({ ok: true, skipped: true, reason: __guard.reason }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    const body = await req.json().catch(() => ({}));
    const batch = Math.max(1, Math.min(150, Number(body.batch) || 100));
    // 2026-05-12: switched to gemini-3.1-flash-lite-preview which has higher rate limits.
    // Validated 480 jobs/105s @ conc 12; bumped to 16, then 20 after Cloud upgrade.
    const concurrency = Math.max(1, Math.min(28, Number(body.concurrency) || 20));

    // FAN-OUT (2026-05-12): observed only ~250 jobs/min with single runner per cron tick
    // → 460k backlog = 30+ hours. Fire N-1 sibling invocations in parallel (fire-and-forget)
    // so each cron tick produces ~3x throughput without raising concurrency (avoids 429s).
    // Children pass `child:true` to skip further fan-out.
    // FAN-OUT (2026-05-12): tested fanout=3 with EdgeRuntime.waitUntil — children
    // collided on AI rate limit, throughput DROPPED to 100/min. Reverted to 1.
    // Real bottleneck is per-key Lovable AI rate limit, not edge concurrency.
    const isChild = Boolean(body.child);
    const fanout = Math.max(1, Math.min(5, Number(body.fanout) || 1));
    if (!isChild && fanout > 1) {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/seo-enrich-runner`;
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      for (let i = 1; i < fanout; i++) {
        const p = fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
          body: JSON.stringify({ batch, concurrency, child: true }),
        }).catch(() => {});
        try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch { /* noop */ }
      }
    }

    // Reap stale processing locks before claiming. Best-effort.
    let reaped_stale_locks = 0;
    try {
      const { data: r } = await admin.rpc("reap_ai_stale_locks", { _older_than_minutes: 5 });
      reaped_stale_locks = Number(r) || 0;
    } catch { /* noop */ }

    // Controls
    const { data: ctrlRow } = await admin.from("app_settings").select("value").eq("key", "ai_seo_controls").maybeSingle();
    const ctrl = (ctrlRow?.value || {}) as any;
    if (ctrl.enabled === false) return json({ ok: true, paused: true });
    const dailyBudget = Number(ctrl.daily_budget_usd ?? 1);
    const model = String(ctrl.model || "google/gemini-2.5-flash");
    const maxAttempts = Number(ctrl.max_attempts || 3);

    // Today's spend
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const dayKey = today.toISOString().slice(0, 10);
    const { data: spendRow } = await admin.from("ai_spend_daily").select("*").eq("day", dayKey).maybeSingle();
    let spend = Number(spendRow?.spend_usd || 0);
    let calls = Number(spendRow?.calls || 0);
    if (spend >= dailyBudget) return json({ ok: true, budget_reached: true, spend });

    let processed = 0, succeeded = 0, failed = 0, rate_limited = 0;
    let stop = false;
    let total_claimed = 0;
    let drain_loops = 0;
    // Time we reserve at the end of the budget for spend upsert + adaptive cron RPC
    const TAIL_RESERVE_MS = 5_000;

    const runJob = async (job: any) => {
      if (stop) return;
      if (Date.now() - startedAt > TIME_BUDGET_MS) { stop = true; return; }
      if (spend >= dailyBudget) {
        await admin.from("ai_enrichment_jobs").update({ status: "pending", locked_until: null }).eq("id", job.id);
        return;
      }
      processed++;
      try {
        const isPodcast = job.kind === "seo_podcast";
        let prompt = job.result?.prompt as string | undefined;
        if (!prompt) {
          if (isPodcast) {
            const { data: p } = await admin.from("podcasts").select("title,display_title,description,category,language").eq("id", job.target_id).maybeSingle();
            if (!p) throw new Error("target_missing");
            prompt = podcastUserPrompt(p as any);
          } else {
            const { data: e } = await admin.from("episodes").select("title,display_title,description,podcasts!inner(title,display_title,language)").eq("id", job.target_id).maybeSingle();
            if (!e) throw new Error("target_missing");
            const podName = ((e as any).podcasts?.display_title) || ((e as any).podcasts?.title) || "";
            const podLanguage = ((e as any).podcasts?.language) || null;
            prompt = episodeUserPrompt(e as any, podName, podLanguage);
          }
        }
        const tool = isPodcast ? PODCAST_SEO_TOOL : EPISODE_SEO_TOOL;
        const toolName = isPodcast ? "podcast_seo" : "episode_seo";
        const ai = await callAI(model, [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ], [tool], toolName);
        const usage = ai.usage || {};
        const inTok = Number(usage.prompt_tokens || 0);
        const outTok = Number(usage.completion_tokens || 0);
        const cost = (inTok / 1000) * PRICE_IN_PER_1K + (outTok / 1000) * PRICE_OUT_PER_1K;

        const args = ai.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        const parsed = args ? JSON.parse(args) : null;
        if (!parsed) throw new Error("no_tool_call");

        const trim = (s: string, max: number) => {
          s = s.replace(/\s+/g, " ").trim();
          if (s.length <= max) return s;
          const cut = s.slice(0, max);
          const sp = cut.lastIndexOf(" ");
          return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:\-–—\s]+$/, "") + "…";
        };
        // Gemini-detected actual content language (ISO 639-1). If it's not 'en',
        // overwrite podcasts.language so the EN-only public surfaces hide it.
        const detectedLang = String(parsed.detected_language || "").toLowerCase().trim().slice(0, 8) || null;
        if (isPodcast) {
          const seo_title = trim(String(parsed.seo_title || ""), 65);
          const seo_description = trim(String(parsed.seo_description || ""), 160);
          const update: any = { seo_title, seo_description, ai_enriched_at: new Date().toISOString() };
          if (detectedLang && detectedLang !== "en") update.language = detectedLang;
          await admin.from("podcasts").update(update).eq("id", job.target_id);
        } else {
          const seo_title = trim(String(parsed.seo_title || ""), 70);
          const seo_description = trim(String(parsed.seo_description || ""), 160);
          const ai_summary = trim(String(parsed.ai_summary || ""), 280);
          await admin.from("episodes").update({
            seo_title, seo_description, ai_summary,
            ai_enriched_at: new Date().toISOString(),
          }).eq("id", job.target_id);
          // If a real (non-mul) non-EN language is detected for the episode, fix the parent
          // podcast if it's still mis-tagged as English. One Yoruba episode in an "en" feed
          // means the show itself is non-EN.
          if (detectedLang && detectedLang !== "en" && detectedLang !== "mul") {
            const { data: ep } = await admin.from("episodes").select("podcast_id").eq("id", job.target_id).maybeSingle();
            if (ep?.podcast_id) {
              const { data: parent } = await admin.from("podcasts").select("language").eq("id", ep.podcast_id).maybeSingle();
              const parentLang = String(parent?.language || "").toLowerCase();
              if (!parentLang || parentLang.startsWith("en")) {
                await admin.from("podcasts").update({ language: detectedLang }).eq("id", ep.podcast_id);
              }
            }
          }
        }

        await admin.from("ai_enrichment_jobs").update({
          status: "done",
          completed_at: new Date().toISOString(),
          model, cost_usd: cost, input_tokens: inTok, output_tokens: outTok,
          result: { ...job.result, parsed },
          last_error: null,
        }).eq("id", job.id);

        succeeded++;
        spend += cost; calls++;
      } catch (err: any) {
        failed++;
        const msg = err?.message || "error";
        if (msg === "budget_exhausted_provider") { rate_limited++; stop = true; }
        else if (msg === "rate_limited") {
          rate_limited++;
          // Don't kill the whole drain — only stop when rate-limit storm is severe.
          // Lite-preview returns sporadic 429s under high concurrency; treating each
          // one as fatal wasted ~80% of the claimed batch.
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

    // Drain loop: keep claiming new batches until time/budget runs out or queue is empty.
    // Eliminates the ~93% idle-time-per-cron-tick problem when each batch finishes in 3-8s.
    while (!stop) {
      if (Date.now() - startedAt > TIME_BUDGET_MS - TAIL_RESERVE_MS) break;
      if (spend >= dailyBudget) break;

      const { data: claimed, error: cErr } = await admin.rpc("claim_ai_jobs", { _limit: batch, _lock_seconds: 120 });
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

    // Update daily spend
    await admin.from("ai_spend_daily").upsert({
      day: dayKey, spend_usd: spend, calls,
      by_kind: { ...(spendRow?.by_kind || {}) },
      updated_at: new Date().toISOString(),
    });

    // Auto-pause if budget reached
    if (spend >= dailyBudget) {
      const newCtrl = { ...ctrl, enabled: false, auto_paused_reason: "daily_budget_reached", auto_paused_at: new Date().toISOString() };
      await admin.from("app_settings").upsert({ key: "ai_seo_controls", value: newCtrl, updated_at: new Date().toISOString() });
    }

    // Adaptive cron — STEPPED backoff. Never crash to */30 while backlog>0.
    // Allowed: *, */2, */5, */10, */30. Steps: rate-limit gently slows but
    // keeps cadence proportional to remaining work.
    let next_schedule: string | null = null;
    try {
      const { count: pending } = await admin.from("ai_enrichment_jobs").select("id", { count: "exact", head: true }).eq("status", "pending");
      const p = Number(pending || 0);
      // 2026-05-12: drain-loop processes hundreds per minute @ conc 16, so keep
      // every-minute cadence as long as there's any meaningful backlog. Old thresholds
      // (>500 → *, 100–500 → */2) wasted time idling whenever backlog dipped under 500.
      if (rate_limited > 0) {
        // Gentle stepdown on rate limits, but never below */1 while backlog is huge.
        if (p > 1000) next_schedule = "* * * * *";
        else if (p > 100) next_schedule = "*/2 * * * *";
        else if (p >= 10) next_schedule = "*/5 * * * *";
        else if (p >= 1) next_schedule = "*/10 * * * *";
        else next_schedule = "*/30 * * * *";
      } else {
        if (p > 50) next_schedule = "* * * * *";
        else if (p >= 10) next_schedule = "*/2 * * * *";
        else if (p >= 1) next_schedule = "*/10 * * * *";
        else next_schedule = "*/30 * * * *";
      }
      try { await admin.rpc("set_seo_enrich_runner_schedule" as any, { _schedule: next_schedule }); } catch { /* ignore */ }
    } catch { /* ignore */ }

    return json({ ok: true, claimed: total_claimed, drain_loops, processed, succeeded, failed, rate_limited, concurrency, spend_usd: spend, reaped_stale_locks, next_schedule, elapsed_ms: Date.now() - startedAt });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
