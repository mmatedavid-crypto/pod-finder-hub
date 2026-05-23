// description-cleanup-runner: drains pending podcasts/episodes, runs rules-based
// cleanup, optionally escalates to AI (gemini-flash-lite) on S/A tier when
// signal patterns survive. Adaptive cron, $5/day AI soft cap, fail-CLOSED on
// background_jobs kill switch.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkBackgroundJobsAllowed } from "../_shared/incident-guard.ts";
import { cleanDescription } from "../_shared/description-cleanup.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const AI_MODEL = "google/gemini-2.5-flash-lite";
const AI_PRICE_IN_PER_1K = 0.00010;
const AI_PRICE_OUT_PER_1K = 0.00040;
const AI_DAILY_BUDGET = 5.0;
const AI_BACKFILL_TOTAL_CAP = 20.0;

async function aiRefine(rawText: string): Promise<{ text: string; inTok: number; outTok: number }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("missing_gemini_api_key");
  const prompt = `You are a text cleaner. From the podcast description below, REMOVE:
- sponsor blocks ("brought to you by", "today's sponsor", promo codes)
- social/subscribe CTAs ("follow us on...", "subscribe to...", patreon/discord/substack pitches)
- link lists / "show notes" / "links mentioned" sections
- timestamp/chapter lists (00:00 markers)
- standalone URLs
- ad-network footers ("hosted on acast", "see acast.com/privacy", "your ad choices")
KEEP the actual descriptive content about the episode.
Return ONLY the cleaned text. No preamble. No quotes. If the input is mostly junk and nothing meaningful remains, return the empty string.

INPUT:
${rawText.slice(0, 8000)}

CLEANED:`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
    }),
  });
  if (r.status === 429) throw new Error("rate_limited");
  if (!r.ok) throw new Error(`ai_${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const inTok = j.usageMetadata?.promptTokenCount ?? Math.ceil(prompt.length / 4);
  const outTok = j.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4);
  return { text: text.trim(), inTok, outTok };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 55_000;
  const TIME_RESERVE_MS = 8_000;

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const guard = await checkBackgroundJobsAllowed(admin, "description-cleanup-runner");
    if (guard.blocked) return json({ ok: true, skipped: true, reason: guard.reason });
    const body = await req.json().catch(() => ({}));

    const { data: ctrlRow } = await admin.from("app_settings")
      .select("value").eq("key", "description_cleanup_controls").maybeSingle();
    const ctrl = (ctrlRow?.value || {}) as any;
    if (ctrl.enabled === false) return json({ ok: true, paused: true });
    const batch = Math.max(1, Math.min(500, Number(body.batch) || Number(ctrl.batch_size) || 200));
    const aiAllowedTiers: string[] = ctrl.ai_tiers || ["S", "A"];
    const kindPriority: string[] = body.kind ? [String(body.kind)] : (ctrl.kind_priority || ["podcast", "episode"]);

    // Daily AI spend
    const dayKey = new Date().toISOString().slice(0, 10);
    const { data: spendRow } = await admin.from("ai_spend_daily").select("*").eq("day", dayKey).maybeSingle();
    const byKind = (spendRow?.by_kind as any) || {};
    let aiSpendToday = Number(byKind.description_cleanup_usd || 0);
    let aiSpendLifetime = Number(ctrl.ai_spend_lifetime_usd || 0);
    let totalSpend = Number(spendRow?.spend_usd || 0);
    let calls = Number(spendRow?.calls || 0);

    let processed = 0, rulesOk = 0, aiRefined = 0, skipped = 0, reverted = 0, errors = 0;
    const errSamples: any[] = [];

    for (const kind of kindPriority) {
      if (Date.now() - startedAt > TIME_BUDGET_MS - TIME_RESERVE_MS) break;
      const table = kind === "podcast" ? "podcasts" : "episodes";

      // Drain loop per kind
      while (Date.now() - startedAt < TIME_BUDGET_MS - TIME_RESERVE_MS) {
        const { data: rows, error: candErr } = await admin.rpc(
          "select_description_cleanup_candidates" as any,
          { _limit: batch, _kind: kind },
        );
        if (candErr) { errors++; errSamples.push({ stage: "candidates", err: candErr.message }); break; }
        const cands: any[] = (rows as any[]) || [];
        if (cands.length === 0) break;

        for (const c of cands) {
          if (Date.now() - startedAt > TIME_BUDGET_MS - TIME_RESERVE_MS) break;
          try {
            const result = cleanDescription(c.description as string);
            let display = result.display;
            let status: string = result.status;
            let usedAi = false;
            let aiModel: string | null = null;

            const tier = c.tier || "D";
            const canAi =
              result.needsAi &&
              aiAllowedTiers.includes(tier) &&
              aiSpendToday < AI_DAILY_BUDGET &&
              aiSpendLifetime < AI_BACKFILL_TOTAL_CAP;

            if (canAi) {
              try {
                const { text, inTok, outTok } = await aiRefine(result.display);
                const cost = (inTok / 1000) * AI_PRICE_IN_PER_1K + (outTok / 1000) * AI_PRICE_OUT_PER_1K;
                aiSpendToday += cost; aiSpendLifetime += cost; totalSpend += cost; calls++;
                aiModel = AI_MODEL;
                if (text && text.length >= 50 && text.length / Math.max(1, result.display.length) >= 0.20) {
                  display = text;
                  status = "ai_refined";
                  usedAi = true;
                }
              } catch (aiErr: any) {
                errSamples.push({ id: c.id, stage: "ai", err: String(aiErr?.message || aiErr) });
              }
            }

            // Compute real removed_pct against final display (post-AI if used).
            const origLen = String(c.description || "").length;
            const finalRemovedPct = origLen > 0
              ? Math.max(0, Math.round((1 - display.length / origLen) * 100))
              : 0;

            const meta = {
              removed_pct: finalRemovedPct,
              rules_removed_pct: result.removedPct,
              reasons: result.reasons,
              needs_ai: result.needsAi,
              used_ai: usedAi,
              ai_model: aiModel,
              tier,
            };

            const { error: upErr } = await admin.from(table).update({
              display_description: display,
              description_cleaned_at: new Date().toISOString(),
              description_cleanup_status: status,
              description_cleanup_meta: meta,
            }).eq("id", c.id);
            if (upErr) throw upErr;

            processed++;
            if (status === "rules_ok") rulesOk++;
            else if (status === "ai_refined") aiRefined++;
            else if (status === "skipped") skipped++;
            else if (status === "reverted") reverted++;
          } catch (e: any) {
            errors++;
            if (errSamples.length < 5) errSamples.push({ id: c.id, err: String(e?.message || e) });
            // Mark as skipped to avoid infinite retry on a poison row
            await admin.from(table).update({
              description_cleanup_status: "skipped",
              description_cleaned_at: new Date().toISOString(),
              description_cleanup_meta: { error: String(e?.message || e).slice(0, 500) },
            }).eq("id", c.id);
          }
        }

        if (cands.length < batch) break;
      }
    }

    // Persist AI spend
    if (calls > 0 || aiSpendToday > Number(byKind.description_cleanup_usd || 0)) {
      await admin.from("ai_spend_daily").upsert({
        day: dayKey, spend_usd: totalSpend, calls,
        by_kind: { ...byKind, description_cleanup_usd: aiSpendToday, description_cleanup_count: Number(byKind.description_cleanup_count || 0) + aiRefined },
        updated_at: new Date().toISOString(),
      });
    }

    // Stats & adaptive cron
    const { data: statsRow } = await admin.rpc("description_cleanup_stats" as any);
    const s: any = (statsRow as any[])?.[0] || {};
    const pending = Number(s.ep_pending || 0) + Number(s.pod_pending || 0);

    let recommended: string;
    if (pending > 50_000) recommended = "* * * * *";
    else if (pending > 10_000) recommended = "*/2 * * * *";
    else if (pending > 1_000) recommended = "*/5 * * * *";
    else if (pending > 0) recommended = "*/15 * * * *";
    else recommended = "*/30 * * * *";
    try { await admin.rpc("set_description_cleanup_schedule" as any, { _schedule: recommended }); } catch { /* */ }

    // Pause on AI lifetime cap — re-read controls to avoid clobbering concurrent writes.
    if (aiSpendLifetime >= AI_BACKFILL_TOTAL_CAP || aiRefined > 0) {
      const { data: freshCtrlRow } = await admin.from("app_settings")
        .select("value").eq("key", "description_cleanup_controls").maybeSingle();
      const freshCtrl = (freshCtrlRow?.value || {}) as any;
      const freshLifetime = Number(freshCtrl.ai_spend_lifetime_usd || 0);
      // Merge: add only our delta (this run's AI cost) onto the freshest value.
      const myDelta = aiSpendLifetime - Number(ctrl.ai_spend_lifetime_usd || 0);
      const mergedLifetime = Math.max(freshLifetime, freshLifetime + myDelta);
      const nextCtrl: any = { ...freshCtrl, ai_spend_lifetime_usd: mergedLifetime };
      if (mergedLifetime >= AI_BACKFILL_TOTAL_CAP) {
        nextCtrl.ai_tiers = [];
        nextCtrl.ai_paused_at = new Date().toISOString();
      }
      await admin.from("app_settings").upsert({
        key: "description_cleanup_controls",
        value: nextCtrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });
      aiSpendLifetime = mergedLifetime;
    }

    const progress = {
      last_run_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      processed, rules_ok: rulesOk, ai_refined: aiRefined, skipped, reverted, errors,
      error_samples: errSamples,
      ai_spend_today_usd: aiSpendToday,
      ai_spend_lifetime_usd: aiSpendLifetime,
      pending,
      stats: s,
      cron_schedule: recommended,
    };
    await admin.from("app_settings").upsert({
      key: "description_cleanup_progress", value: progress as any, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    return json({ ok: true, ...progress });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
