// Pipeline watchdog: runs every 5 minutes, checks AI runners for budget overshoot,
// API key expiry, error spikes, and stale progress. Posts Telegram alerts with
// dedup window, optionally auto-pauses critical incidents (unless dry_run).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RunnerCfg {
  name: string;
  spend_key: string;
  controls_key?: string;
  progress_key?: string;
  cadence_minutes?: number;
}

interface WatchdogState {
  enabled: boolean;
  dry_run: boolean;
  stale_lock_minutes: number;
  alert_dedup_minutes: number;
  budget_overshoot_ratio: number;
  error_rate_window_minutes: number;
  min_calls_for_error_rate: number;
  env_label: string;
  skip_intentionally_disabled: boolean;
  runners: RunnerCfg[];
}

interface Incident {
  runner: string;
  rule: string;
  severity: "info" | "warn" | "critical";
  message: string;
  payload: Record<string, any>;
}

async function sendTelegram(text: string): Promise<{ ok: boolean; error?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  const CHAT_ID = Deno.env.get("TELEGRAM_ALERT_CHAT_ID");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !CHAT_ID) {
    return { ok: false, error: "missing_telegram_env" };
  }
  try {
    const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `telegram_${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as any)?.message || String(e) };
  }
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(3)}`;
}

function buildAlertText(inc: Incident, dryRun: boolean, envLabel: string): string {
  const sevTag = inc.severity === "critical" ? "🚨 CRITICAL" : inc.severity === "warn" ? "⚠️ WARN" : "ℹ️ INFO";
  const autoPause = inc.payload.auto_paused ? "\n<b>⛔ AUTO-PAUSED</b>" : "";
  const dryTag = dryRun ? " <i>(dry-run)</i>" : "";
  const envTag = envLabel ? `<b>[${envLabel}]</b> ` : "";
  const lines = [
    `${envTag}${sevTag} <b>${inc.runner}</b> — ${inc.rule}${dryTag}`,
    inc.message,
  ];
  const meta = { ...inc.payload };
  delete meta.auto_paused;
  if (Object.keys(meta).length) {
    lines.push(`<pre>${JSON.stringify(meta, null, 2).slice(0, 600)}</pre>`);
  }
  return lines.join("\n") + autoPause;
}

async function runChecks(admin: any, state: WatchdogState, runners: RunnerCfg[]): Promise<Incident[]> {
  const incidents: Incident[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Load shared inputs
  const [{ data: budgetRow }, { data: spendRow }] = await Promise.all([
    admin.from("app_settings").select("value").eq("key", "ai_budget").maybeSingle(),
    admin.from("ai_spend_daily").select("by_kind,spend_usd").eq("day", today).maybeSingle(),
  ]);
  const perJobCaps: Record<string, number> = (budgetRow?.value?.per_job_caps_usd || {}) as any;
  const byKind: Record<string, any> = (spendRow?.by_kind || {}) as any;

  const sinceErrWin = new Date(Date.now() - state.error_rate_window_minutes * 60_000).toISOString();

  // Pre-fetch all controls to determine intentionally-disabled runners
  const controlsKeys = runners.map((r) => r.controls_key).filter(Boolean) as string[];
  const { data: ctrlRows } = controlsKeys.length
    ? await admin.from("app_settings").select("key,value").in("key", controlsKeys)
    : { data: [] as any[] };
  const ctrlMap = new Map<string, any>((ctrlRows || []).map((r: any) => [r.key, r.value || {}]));

  for (const r of runners) {
    // Skip intentionally-disabled runners (controls.enabled === false) unless explicitly told not to
    if (state.skip_intentionally_disabled !== false && r.controls_key) {
      const ctrl = ctrlMap.get(r.controls_key);
      if (ctrl && ctrl.enabled === false) continue;
    }

    const spend = Math.max(Number(byKind[`${r.spend_key}_usd`] || 0), Number(byKind[r.spend_key] || 0));
    const cap = Number(perJobCaps[r.spend_key] || 0);

    // budget rules
    if (cap > 0) {
      const ratio = spend / cap;
      if (spend >= cap * state.budget_overshoot_ratio) {
        incidents.push({
          runner: r.name,
          rule: "budget_overshoot",
          severity: "critical",
          message: `Daily spend ${fmtUsd(spend)} ≥ cap ${fmtUsd(cap)} × ${state.budget_overshoot_ratio} (${(ratio * 100).toFixed(0)}% of cap).`,
          payload: { spend_usd: spend, cap_usd: cap, ratio },
        });
      } else if (spend >= cap) {
        incidents.push({
          runner: r.name,
          rule: "budget_exceeded",
          severity: "warn",
          message: `Daily spend ${fmtUsd(spend)} reached cap ${fmtUsd(cap)}.`,
          payload: { spend_usd: spend, cap_usd: cap },
        });
      }
    }

    // recent audit window
    const { data: recent } = await admin
      .from("ai_call_audit")
      .select("status,error_message,created_at")
      .eq("job_type", r.spend_key)
      .gte("created_at", sinceErrWin)
      .order("created_at", { ascending: false })
      .limit(500);
    const rows = recent || [];
    const total = rows.length;
    const errors = rows.filter((x: any) => x.status === "error").length;

    // api key expired pattern
    const keyExpiredHit = rows.find((x: any) =>
      typeof x.error_message === "string" &&
      /LOVABLE_API_KEY|api[_ -]?key/i.test(x.error_message) &&
      /(expire|invalid|unauthorized|401|403)/i.test(x.error_message),
    );
    if (keyExpiredHit) {
      incidents.push({
        runner: r.name,
        rule: "api_key_expired",
        severity: "critical",
        message: `API key error detected in recent logs.`,
        payload: { sample_error: String(keyExpiredHit.error_message).slice(0, 240), errors, total },
      });
    }

    // error rate
    if (total >= state.min_calls_for_error_rate) {
      const rate = errors / total;
      if (rate > 0.5) {
        incidents.push({
          runner: r.name,
          rule: "high_error_rate",
          severity: "critical",
          message: `Error rate ${(rate * 100).toFixed(0)}% (${errors}/${total}) in last ${state.error_rate_window_minutes}m.`,
          payload: { errors, total, rate },
        });
      } else if (rate > 0.2) {
        incidents.push({
          runner: r.name,
          rule: "elevated_error_rate",
          severity: "warn",
          message: `Error rate ${(rate * 100).toFixed(0)}% (${errors}/${total}) in last ${state.error_rate_window_minutes}m.`,
          payload: { errors, total, rate },
        });
      }
    }

    // stale runner: threshold = max(global_stale, cadence * 2), so daily jobs don't false-alarm hourly
    const staleThresholdMin = Math.max(
      state.stale_lock_minutes,
      Math.round(Number(r.cadence_minutes || 0) * 2),
    );
    const staleCutoff = new Date(Date.now() - staleThresholdMin * 60_000).toISOString();
    let lastRun: string | null = null;
    if (r.progress_key) {
      const { data: prog } = await admin
        .from("app_settings")
        .select("value,updated_at")
        .eq("key", r.progress_key)
        .maybeSingle();
      lastRun = prog?.value?.last_run_at || prog?.updated_at || null;
    }
    if (!lastRun) {
      const { data: latest } = await admin
        .from("ai_call_audit")
        .select("created_at")
        .eq("job_type", r.spend_key)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastRun = latest?.created_at || null;
    }
    if (lastRun && lastRun < staleCutoff) {
      const ageMin = Math.round((Date.now() - new Date(lastRun).getTime()) / 60_000);
      incidents.push({
        runner: r.name,
        rule: "stale_runner",
        severity: "warn",
        message: `No activity for ${ageMin}m (threshold ${staleThresholdMin}m).`,
        payload: { last_run_at: lastRun, age_minutes: ageMin, threshold_minutes: staleThresholdMin },
      });
    }
  }

  return incidents;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: stateRow } = await admin
      .from("app_settings").select("value").eq("key", "watchdog_state").maybeSingle();
    const stateRaw = (stateRow?.value || {}) as any;
    const state: WatchdogState = {
      enabled: stateRaw.enabled !== false,
      dry_run: stateRaw.dry_run !== false,
      stale_lock_minutes: Number(stateRaw.stale_lock_minutes ?? 60),
      alert_dedup_minutes: Number(stateRaw.alert_dedup_minutes ?? 30),
      budget_overshoot_ratio: Number(stateRaw.budget_overshoot_ratio ?? 1.2),
      error_rate_window_minutes: Number(stateRaw.error_rate_window_minutes ?? 30),
      min_calls_for_error_rate: Number(stateRaw.min_calls_for_error_rate ?? 10),
      env_label: String(stateRaw.env_label ?? "podiverzum.com"),
      skip_intentionally_disabled: stateRaw.skip_intentionally_disabled !== false,
      runners: Array.isArray(stateRaw.runners) ? stateRaw.runners : [],
    };

    if (!state.enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: "watchdog_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const incidents = await runChecks(admin, state, state.runners);
    const dedupCutoff = new Date(Date.now() - state.alert_dedup_minutes * 60_000).toISOString();

    const results: any[] = [];
    for (const inc of incidents) {
      const dedupKey = `${inc.runner}::${inc.rule}`;

      // Dedup check
      const { data: recentAlert } = await admin
        .from("watchdog_events")
        .select("id, created_at")
        .eq("dedup_key", dedupKey)
        .eq("alert_sent", true)
        .gte("created_at", dedupCutoff)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const shouldAlert = !recentAlert;

      // Auto-pause on critical (non-dry-run)
      let autoPaused = false;
      const isCritical = inc.severity === "critical" &&
        (inc.rule === "budget_overshoot" || inc.rule === "api_key_expired");
      if (isCritical && !state.dry_run) {
        const runnerCfg = state.runners.find((r) => r.name === inc.runner);
        if (runnerCfg?.controls_key) {
          const { data: curCtrl } = await admin
            .from("app_settings").select("value").eq("key", runnerCfg.controls_key).maybeSingle();
          const next = { ...(curCtrl?.value || {}), enabled: false, paused_by: "pipeline_watchdog", paused_at: new Date().toISOString() };
          await admin.from("app_settings").upsert({ key: runnerCfg.controls_key, value: next });
          autoPaused = true;
          inc.payload.auto_paused = true;
        }
      }

      let alertResult: any = { sent: false };
      if (shouldAlert) {
        const text = buildAlertText(inc, state.dry_run);
        alertResult = await sendTelegram(text);
      }

      await admin.from("watchdog_events").insert({
        runner: inc.runner,
        rule: inc.rule,
        severity: inc.severity,
        message: inc.message,
        payload: inc.payload,
        dedup_key: dedupKey,
        auto_paused: autoPaused,
        alert_sent: shouldAlert && alertResult.ok === true,
      });

      results.push({ ...inc, alertSent: shouldAlert && alertResult.ok === true, alertError: alertResult.error, autoPaused, dedup_skipped: !shouldAlert });
    }

    return new Response(JSON.stringify({
      ok: true,
      dry_run: state.dry_run,
      checked: state.runners.length,
      incidents: results.length,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("watchdog error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as any)?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
