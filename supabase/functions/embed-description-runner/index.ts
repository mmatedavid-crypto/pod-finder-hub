// Embeds long episode descriptions (>1600 char) as multi-vector chunks
// (2500 char window, 300 char overlap). Mirrors embed-chunks-runner pattern:
// hash-cached, $ budget, adaptive cron, drain loop, async-friendly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkBackgroundJobsAllowed } from "../_shared/incident-guard.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PRICE_IN_PER_1K = 0.000025;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function sanitizeForJson(s: string): string {
  if (!s) return "";
  let out = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  out = out.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "");
  out = out.replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1");
  return out;
}

// Sentence-aware chunker
function chunkText(text: string, chunkSize = 2500, overlap = 300): string[] {
  const clean = stripHtml(text || "");
  if (clean.length <= chunkSize) return clean.length >= 200 ? [clean] : [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + chunkSize, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(end - 300, end + 150);
      const lastPunct = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf("\n"));
      if (lastPunct > 0) end = (end - 300) + lastPunct + 1;
    }
    const chunk = clean.slice(i, end).trim();
    if (chunk.length >= 200) out.push(chunk);
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out;
}

async function embed(model: string, text: string): Promise<{ vec: number[]; tokens: number }> {
  const googleModel = model.replace(/^google\//, "");
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("missing_gemini_api_key");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${googleModel}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${googleModel}`,
      content: { parts: [{ text }] },
      taskType: "SEMANTIC_SIMILARITY",
      outputDimensionality: 768,
    }),
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) throw new Error(`gemini_${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const vec = j.embedding?.values as number[] | undefined;
  if (!vec || vec.length !== 768) throw new Error("bad_embedding");
  return { vec, tokens: Math.ceil(text.length / 4) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 55_000;
  const TIME_RESERVE_MS = 8_000;

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const guard = await checkBackgroundJobsAllowed(admin, "embed-description-runner");
    if (guard.blocked) return json({ ok: true, skipped: true, reason: guard.reason });
    const body = await req.json().catch(() => ({}));

    const { data: ctrlRow } = await admin.from("app_settings").select("value").eq("key", "embed_description_controls").maybeSingle();
    const ctrl = (ctrlRow?.value || {}) as any;
    if (ctrl.enabled === false) return json({ ok: true, paused: true });
    const model = String(ctrl.model || "google/gemini-embedding-001");
    const dailyBudget = Number(ctrl.daily_budget_usd ?? 10);
    const batch = Math.max(1, Math.min(200, Number(body.batch) || Number(ctrl.batch_size) || 80));
    const concurrency = Math.max(1, Math.min(16, Number(body.concurrency) || Number(ctrl.concurrency) || 8));
    const chunkSize = Math.max(1500, Math.min(4000, Number(ctrl.chunk_size) || 2500));
    const overlap = Math.max(0, Math.min(600, Number(ctrl.chunk_overlap) || 300));

    const dayKey = new Date().toISOString().slice(0, 10);
    const { data: spendRow } = await admin.from("ai_spend_daily").select("*").eq("day", dayKey).maybeSingle();
    const byKind = (spendRow?.by_kind as any) || {};
    let descSpend = Number(byKind.embed_description_usd || 0);
    let totalSpend = Number(spendRow?.spend_usd || 0);
    let calls = Number(spendRow?.calls || 0);
    if (descSpend >= dailyBudget) return json({ ok: true, budget_reached: true, spend: descSpend });

    let episodesProcessed = 0, chunksWritten = 0, errors = 0, drainPasses = 0;
    const errorSamples: any[] = [];
    let stop = false;

    while (!stop) {
      if (Date.now() - startedAt > TIME_BUDGET_MS - TIME_RESERVE_MS) break;
      if (descSpend >= dailyBudget) break;

      const { data: candRows, error: candErr } = await admin.rpc("select_description_chunk_candidates", { _limit: batch });
      if (candErr) throw candErr;
      const candidates: any[] = (candRows as any[]) || [];
      if (candidates.length === 0) break;
      drainPasses++;

      let i = 0;
      const runOne = async (e: any) => {
        if (stop) return;
        if (Date.now() - startedAt > TIME_BUDGET_MS - TIME_RESERVE_MS) { stop = true; return; }
        if (descSpend >= dailyBudget) { stop = true; return; }
        try {
          const sourceText = String(e.description || "");
          if (sourceText.length <= 1600) return; // RPC should filter, defensive
          const chunks = chunkText(sourceText, chunkSize, overlap);
          if (chunks.length === 0) return;

          const rows: any[] = [];
          for (let idx = 0; idx < chunks.length; idx++) {
            if (descSpend >= dailyBudget) { stop = true; break; }
            const text = chunks[idx];
            const hash = await sha256(`description|${idx}|${text}`);
            const { vec, tokens } = await embed(model, text);
            const cost = (tokens / 1000) * PRICE_IN_PER_1K;
            descSpend += cost; totalSpend += cost; calls++;
            rows.push({
              episode_id: e.id,
              podcast_id: e.podcast_id,
              chunk_idx: idx,
              source: "description",
              text: sanitizeForJson(text),
              embedding: `[${vec.join(",")}]`,
              content_hash: hash,
              model,
              updated_at: new Date().toISOString(),
            });
          }

          if (rows.length > 0) {
            const { error: insErr } = await admin.from("episode_chunks").insert(rows);
            if (insErr) throw insErr;
            chunksWritten += rows.length;
            episodesProcessed++;
          }
        } catch (err: any) {
          errors++;
          if (errorSamples.length < 5) errorSamples.push({ id: e.id, error: String(err?.message || err) });
        }
      };

      const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
          const idx = i++;
          if (idx >= candidates.length || stop) return;
          await runOne(candidates[idx]);
        }
      });
      await Promise.all(workers);

      if (candidates.length < batch) break;
    }

    await admin.from("ai_spend_daily").upsert({
      day: dayKey, spend_usd: totalSpend, calls,
      by_kind: {
        ...byKind,
        embed_description_usd: descSpend,
        embed_description_count: Number(byKind.embed_description_count || 0) + chunksWritten,
      },
      updated_at: new Date().toISOString(),
    });

    const { data: stats } = await admin.rpc("description_chunk_candidate_stats");
    const s = (stats as any[])?.[0] || {};
    const pending = Number(s.pending || 0);

    let recommended: string;
    if (pending > 20000) recommended = "* * * * *";
    else if (pending > 5000) recommended = "*/2 * * * *";
    else if (pending > 500) recommended = "*/5 * * * *";
    else if (pending > 50) recommended = "*/15 * * * *";
    else if (pending > 0) recommended = "*/30 * * * *";
    else recommended = "*/30 * * * *";
    if (errors > episodesProcessed && episodesProcessed > 0) {
      const stepDown: Record<string, string> = {
        "* * * * *": "*/2 * * * *", "*/2 * * * *": "*/5 * * * *",
        "*/5 * * * *": "*/15 * * * *", "*/15 * * * *": "*/30 * * * *",
      };
      recommended = stepDown[recommended] || recommended;
    }
    try { await admin.rpc("set_embed_description_schedule" as any, { _schedule: recommended }); } catch { /* */ }

    const progress = {
      last_run_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      episodes_processed: episodesProcessed,
      chunks_written: chunksWritten,
      errors, error_samples: errorSamples,
      pending,
      done_episodes: Number(s.done_episodes || 0),
      total_desc_chunks: Number(s.total_desc_chunks || 0),
      spend_usd_today: descSpend,
      cron_schedule: recommended,
      drain_passes: drainPasses,
    };
    await admin.from("app_settings").upsert({
      key: "embed_description_progress", value: progress as any, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    if (descSpend >= dailyBudget) {
      const newCtrl = { ...ctrl, enabled: false, auto_paused_reason: "daily_budget_reached", auto_paused_at: new Date().toISOString() };
      await admin.from("app_settings").upsert({ key: "embed_description_controls", value: newCtrl, updated_at: new Date().toISOString() });
    }

    return json({ ok: true, episodes_processed: episodesProcessed, chunks_written: chunksWritten, errors, pending, spend_usd: descSpend, schedule: recommended });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
