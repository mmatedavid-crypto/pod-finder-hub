// Universal Queue Health Controller.
// Every ~2 min, inspects pending counts for each registered queue-based runner
// and auto-pauses on empty queue, auto-resumes when backlog grows, and detects
// stalls (same pending across N consecutive checks while runner is running).
// Logs every action to queue_health_events. Telegram alert on pause_stall +
// resume. Defaults to dry_run=true on first install.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Runner = {
  name: string;
  controls_key: string;
  pending_kind: string;
  wake_threshold?: number;
  stall_runs?: number;
};

type RunnerHistory = {
  // Pending samples newest-first: pending[0] = most recent, pending[1] = prev, ...
  pending?: number[];
  last_check_at?: string;
  last_action?: string;
};

type State = {
  enabled: boolean;
  dry_run: boolean;
  runners: Runner[];
  history: Record<string, RunnerHistory>;
  last_check_at?: string;
  last_results?: unknown;
};

// Keep up to 6 samples (~12 min @ */2 cron) → enough for stall_runs up to 5.
const HISTORY_KEEP = 6;
// Require N consecutive empty observations before pause_empty (grace period).
const EMPTY_GRACE_RUNS = 2;

const PENDING_KINDS = new Set<string>([
  "description_cleanup_pending",
  "embed_episode_missing",
  "embed_podcast_missing",
  "episodes_chunks_pending",
  "desc_chunk_pending",
  "ai_jobs_seo_pending",
  "ai_jobs_entity_pending",
  "podcasts_ai_category_pending",
  "rss_hunter_pending",
]);

async function countPending(sb: ReturnType<typeof createClient>, kind: string): Promise<number> {
  if (!PENDING_KINDS.has(kind)) throw new Error(`unknown pending_kind: ${kind}`);

  switch (kind) {
    case "description_cleanup_pending": {
      const a = await sb.from("podcasts").select("id", { count: "exact", head: true })
        .eq("description_cleanup_status", "pending");
      const b = await sb.from("episodes").select("id", { count: "exact", head: true })
        .eq("description_cleanup_status", "pending");
      return (a.count ?? 0) + (b.count ?? 0);
    }
    case "embed_episode_missing": {
      // RPC requires _model arg and returns { eligible_total, already_embedded, ... }.
      const model = "google/gemini-embedding-001";
      const { data, error } = await sb.rpc("embed_episode_candidate_stats", { _model: model });
      if (error) throw new Error(`rpc_embed_episode_candidate_stats: ${error.message}`);
      const d = data as any;
      const eligible = Number(d?.eligible_total ?? 0);
      const embedded = Number(d?.already_embedded ?? 0);
      return Math.max(0, eligible - embedded);
    }
    case "embed_podcast_missing": {
      // Align with runner: only S/A/B/C tier + healthy RSS + EN-only.
      const all = await sb.from("podcasts").select("id", { count: "exact", head: true })
        .in("rank_label", ["S", "A", "B", "C"])
        .or("language.is.null,language.ilike.en%")
        .not("shadow_rank_components->>health_state", "in",
          "(\"rss_url_not_found\",\"needs_manual_rss_review\",\"confirmed_dead\",\"quarantined_spam\")");
      const have = await sb.from("podcast_embeddings").select("podcast_id", { count: "exact", head: true });
      return Math.max(0, (all.count ?? 0) - (have.count ?? 0));
    }
    case "episodes_chunks_pending": {
      const r = await sb.from("episodes").select("id", { count: "exact", head: true })
        .eq("chunks_status", "pending");
      return r.count ?? 0;
    }
    case "desc_chunk_pending": {
      const r = await sb.from("episodes").select("id", { count: "exact", head: true })
        .eq("desc_chunk_status", "pending");
      return r.count ?? 0;
    }
    case "ai_jobs_seo_pending": {
      const r = await sb.from("ai_enrichment_jobs").select("id", { count: "exact", head: true })
        .eq("status", "pending").in("kind", ["seo_podcast", "seo_episode"]);
      return r.count ?? 0;
    }
    case "ai_jobs_entity_pending": {
      const r = await sb.from("ai_enrichment_jobs").select("id", { count: "exact", head: true })
        .eq("status", "pending").in("kind", ["entity_extract", "entity_episode"]);
      return r.count ?? 0;
    }
    case "podcasts_ai_category_pending": {
      // Align with categorize-podcast-runner: EN-only + S/A/B/C tier.
      const r = await sb.from("podcasts").select("id", { count: "exact", head: true })
        .is("ai_category_at", null)
        .in("rank_label", ["S", "A", "B", "C"])
        .or("language.is.null,language.ilike.en%");
      return r.count ?? 0;
    }
    case "rss_hunter_pending": {
      // Align with rss-hunter: S/A/B tier only.
      const r = await sb.from("podcasts").select("id", { count: "exact", head: true })
        .in("rss_status", ["not_checked", "error"])
        .in("rank_label", ["S", "A", "B"]);
      return r.count ?? 0;
    }
  }
  return 0;
}

async function sendTelegram(text: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const conn = Deno.env.get("TELEGRAM_API_KEY");
  const chat = Deno.env.get("TELEGRAM_ALERT_CHAT_ID");
  if (!apiKey || !conn || !chat) return { skipped: "missing_secrets" };
  try {
    const r = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "X-Connection-Api-Key": conn,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML" }),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: stateRow } = await sb.from("app_settings").select("value").eq("key", "queue_health_state").maybeSingle();
    const state: State = {
      enabled: true, dry_run: true, runners: [], history: {},
      ...((stateRow?.value as State) || {}),
    };

    if (state.enabled === false) {
      return json({ ok: true, skipped: "globally_disabled" });
    }

    const dryRunOverride = url.searchParams.get("dry_run");
    const dryRun = dryRunOverride !== null
      ? (dryRunOverride === "true" || dryRunOverride === "1")
      : (body.dry_run !== undefined ? !!body.dry_run : !!state.dry_run);

    const onlyRunner = (body.only as string | undefined) || url.searchParams.get("only") || null;

    const results: any[] = [];
    const newHistory: State["history"] = { ...(state.history || {}) };
    const alerts: string[] = [];

    for (const r of state.runners) {
      if (onlyRunner && r.name !== onlyRunner) continue;
      const wake = Math.max(1, Number(r.wake_threshold ?? 5));
      const stallRuns = Math.max(2, Math.min(HISTORY_KEEP, Number(r.stall_runs ?? 3)));

      const hist = newHistory[r.name] || {};
      // Backward-compat with old {p1,p2} shape.
      const legacy = hist as any;
      const prevSamples: number[] = Array.isArray(hist.pending)
        ? hist.pending.slice(0, HISTORY_KEEP)
        : (typeof legacy.p1 === "number" || typeof legacy.p2 === "number"
            ? [legacy.p1, legacy.p2].filter((x: any) => typeof x === "number")
            : []);
      const pendingPrev = prevSamples[0] ?? null;
      const pendingPrevPrev = prevSamples[1] ?? null;

      let pendingNow = 0;
      let countErr: string | null = null;
      try {
        pendingNow = await countPending(sb, r.pending_kind);
      } catch (e) {
        countErr = String((e as Error)?.message || e);
      }

      // Re-read controls right before action to minimize race with admin toggles.
      const { data: ctrlRow } = await sb.from("app_settings")
        .select("value").eq("key", r.controls_key).maybeSingle();
      const ctrl = (ctrlRow?.value || {}) as any;
      const isEnabled = ctrl.enabled !== false;
      const autoPausedBy = ctrl.auto_paused_by as string | undefined;
      const autoPausedReason = ctrl.auto_paused_reason as string | undefined;

      // Build full series (newest-first) including current sample.
      const series: number[] = countErr === null
        ? [pendingNow, ...prevSamples].slice(0, HISTORY_KEEP)
        : prevSamples;

      // Empty grace: require EMPTY_GRACE_RUNS consecutive zeros (including now).
      const consecutiveZeros = (() => {
        let n = 0;
        for (const v of series) { if (v === 0) n++; else break; }
        return n;
      })();
      // Stall window: stallRuns consecutive equal positive samples.
      const stallConfirmed = (() => {
        if (series.length < stallRuns) return false;
        const head = series[0];
        if (!head || head <= 0) return false;
        for (let i = 1; i < stallRuns; i++) {
          if (series[i] !== head) return false;
        }
        return true;
      })();

      let action: "noop" | "pause_empty" | "resume" | "pause_stall" = "noop";
      let reason = "";

      if (countErr) {
        action = "noop";
        reason = `count_error: ${countErr}`;
      } else if (isEnabled && consecutiveZeros >= EMPTY_GRACE_RUNS) {
        action = "pause_empty";
        reason = `queue_empty_x${consecutiveZeros}`;
      } else if (
        !isEnabled
        && autoPausedBy === "queue-health-controller"
        && autoPausedReason === "queue_empty"
        && pendingNow >= wake
      ) {
        action = "resume";
        reason = `pending_${pendingNow}_ge_wake_${wake}`;
      } else if (isEnabled && stallConfirmed) {
        action = "pause_stall";
        reason = `stall_${pendingNow}_x${stallRuns}`;
      }

      const detail: Record<string, unknown> = {
        controls_enabled_before: isEnabled,
        auto_paused_by_before: autoPausedBy ?? null,
        auto_paused_reason_before: autoPausedReason ?? null,
        wake_threshold: wake,
        stall_runs: stallRuns,
        empty_grace_runs: EMPTY_GRACE_RUNS,
        series,
        dry_run: dryRun,
      };
      if (countErr) detail.count_error = countErr;

      // Apply action (unless dry_run)
      if (!dryRun && action !== "noop") {
        const now = new Date().toISOString();
        const nextCtrl = { ...ctrl };
        if (action === "pause_empty" || action === "pause_stall") {
          nextCtrl.enabled = false;
          nextCtrl.auto_paused_by = "queue-health-controller";
          nextCtrl.auto_paused_reason = action === "pause_empty" ? "queue_empty" : "stall_detected";
          nextCtrl.auto_paused_at = now;
        } else if (action === "resume") {
          nextCtrl.enabled = true;
          delete nextCtrl.auto_paused_by;
          delete nextCtrl.auto_paused_reason;
          delete nextCtrl.auto_paused_at;
          nextCtrl.auto_resumed_at = now;
          nextCtrl.auto_resumed_by = "queue-health-controller";
        }
        await sb.from("app_settings").upsert({
          key: r.controls_key,
          value: nextCtrl,
          updated_at: now,
        }, { onConflict: "key" });
      }

      // Log event for any non-noop OR when running in dry_run with a would-be action
      if (action !== "noop") {
        await sb.from("queue_health_events").insert({
          runner: r.name,
          action: dryRun ? `dry_${action}` : action,
          reason,
          pending_now: pendingNow,
          pending_prev: pendingPrev,
          pending_prev_prev: pendingPrevPrev,
          detail,
        });

        if (!dryRun && (action === "pause_stall" || action === "resume")) {
          const emoji = action === "pause_stall" ? "🛑" : "▶️";
          alerts.push(`${emoji} <b>${r.name}</b> → ${action}\nreason: ${reason}\nseries: ${series.slice(0, 5).reverse().join(" → ")}`);
        }
      }

      newHistory[r.name] = {
        pending: series,
        last_check_at: new Date().toISOString(),
        last_action: action,
      };


      results.push({
        runner: r.name,
        pending_now: pendingNow,
        pending_prev: pendingPrev,
        pending_prev_prev: pendingPrevPrev,
        enabled_before: isEnabled,
        action,
        reason,
        dry_run: dryRun,
        count_error: countErr,
      });
    }

    // Persist updated state
    const updatedState: State = {
      ...state,
      history: newHistory,
      last_check_at: new Date().toISOString(),
      last_results: results,
    };
    await sb.from("app_settings").upsert({
      key: "queue_health_state",
      value: updatedState as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    // Fire Telegram alerts (best-effort)
    let telegram: any = null;
    if (alerts.length) {
      telegram = await sendTelegram(`<b>Queue Health Controller</b>\n${alerts.join("\n\n")}`);
    }

    return json({ ok: true, dry_run: dryRun, results, telegram });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
