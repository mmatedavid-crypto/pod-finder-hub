// Shared AI call audit helper.
// Every AI call (or skipped/blocked call) writes one row to public.ai_call_audit.
// Also exposes a model allowlist guard, skip rules, and per-day cap reader.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type AuditStatus = "ok" | "error" | "skipped";

export interface BaseAuditFields {
  job_type: string;            // e.g. "embed_episode", "categorize_podcast"
  provider?: string;           // "gemini_direct" | "lovable_gateway" | "openai"
  key_source?: string;         // "GEMINI_API_KEY" | "LOVABLE_API_KEY" | "OPENAI_API_KEY"
  model_used?: string;
  prompt_version?: string;
  source_hash?: string;
  target_type?: string;        // "episode" | "podcast" | "feed_staging" | ...
  target_id?: string;
  meta?: Record<string, any>;
}

export interface OkAuditFields extends BaseAuditFields {
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost_usd: number;
  confidence?: number;
  latency_ms: number;
}

export interface ErrorAuditFields extends BaseAuditFields {
  error_message: string;
  latency_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost_usd?: number;
}

export interface SkippedAuditFields extends BaseAuditFields {
  skipped_reason: string;
  estimated_cost_usd?: number; // forced to 0
}

// ---------- token + cost estimation ----------

// Rough per-1k pricing for the allowlisted models (USD). Conservative.
const PRICE_PER_1K: Record<string, { in: number; out: number }> = {
  "google/gemini-embedding-001": { in: 0.000025, out: 0 },
  "google/text-embedding-004":   { in: 0.000025, out: 0 },
  "google/gemini-2.5-flash":      { in: 0.000075, out: 0.0003 },
  "google/gemini-2.5-flash-lite": { in: 0.00001,  out: 0.00004 },
};

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || "").length / 4));
}

export function estimateCostUsd(model: string, inTokens = 0, outTokens = 0): number {
  const p = PRICE_PER_1K[model];
  if (!p) return 0;
  return (inTokens / 1000) * p.in + (outTokens / 1000) * p.out;
}

// ---------- safe meta JSON ----------

export function safeMeta(meta: any): Record<string, any> {
  if (!meta || typeof meta !== "object") return {};
  try {
    // Strip non-serialisable, cap at 4KB.
    const s = JSON.stringify(meta);
    if (s.length > 4096) return { _truncated: true, preview: s.slice(0, 4000) };
    return JSON.parse(s);
  } catch {
    return { _unserialisable: true };
  }
}

// ---------- model guard ----------

export interface BudgetSettings {
  daily_total_cap_usd: number;
  per_job_caps_usd: Record<string, number>;
  block_pro: boolean;
  block_gemini3: boolean;
  audit_required: boolean;
  allowlist_models: string[];
}

export async function loadBudget(admin: SupabaseClient): Promise<BudgetSettings> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "ai_budget").maybeSingle();
  const v = (data?.value || {}) as any;
  return {
    daily_total_cap_usd: Number(v.daily_total_cap_usd ?? 5),
    per_job_caps_usd: (v.per_job_caps_usd || {}) as Record<string, number>,
    block_pro: v.block_pro !== false,
    block_gemini3: v.block_gemini3 !== false,
    audit_required: v.audit_required !== false,
    allowlist_models: Array.isArray(v.allowlist_models) ? v.allowlist_models : [],
  };
}

export function isModelAllowed(model: string, budget: BudgetSettings): { ok: boolean; reason?: string } {
  const m = String(model || "").toLowerCase();
  if (!m) return { ok: false, reason: "model_missing" };
  if (budget.block_gemini3 && /(^|\/)gemini-3(\.|-)/.test(m)) return { ok: false, reason: "model_blocked_gemini3" };
  if (budget.block_pro && /gemini-[\d.]+-pro/.test(m)) return { ok: false, reason: "model_blocked_pro" };
  if (/-preview$/.test(m)) return { ok: false, reason: "model_blocked_preview" };
  if (budget.allowlist_models.length && !budget.allowlist_models.includes(model)) {
    return { ok: false, reason: "model_not_allowlisted" };
  }
  return { ok: true };
}

// ---------- daily cap ----------

export async function getDailySpendUsd(admin: SupabaseClient): Promise<number> {
  const dayKey = new Date().toISOString().slice(0, 10);
  const { data } = await admin.from("ai_spend_daily").select("spend_usd").eq("day", dayKey).maybeSingle();
  return Number(data?.spend_usd || 0);
}

export async function isWithinDailyCap(admin: SupabaseClient, budget: BudgetSettings): Promise<{ ok: boolean; spent: number; cap: number }> {
  const spent = await getDailySpendUsd(admin);
  return { ok: spent < budget.daily_total_cap_usd, spent, cap: budget.daily_total_cap_usd };
}

// ---------- skip rules ----------

export function detectSkipReason(input: string | null | undefined, opts?: { minChars?: number }): string | null {
  if (input == null) return "input_null";
  const s = String(input).trim();
  if (s.length === 0) return "input_empty";
  if (/undefined|null|\[object Object\]/i.test(s)) return "input_invalid_placeholder";
  const min = opts?.minChars ?? 12;
  if (s.length < min) return "input_too_short";
  const noEmoji = s.replace(/[\p{Emoji}]/gu, "").trim();
  if (noEmoji.length < min) return "input_only_emoji";
  if (/^https?:\/\/\S+$/.test(s)) return "input_only_url";
  if (/^<[^>]+>(?:\s*<[^>]+>)*$/.test(s)) return "input_only_html";
  if (/^\d{1,2}[:.]\d{1,2}([:.]\d{1,2})?$/.test(s)) return "input_only_timestamp";
  return null;
}

// ---------- writers ----------

async function writeAudit(admin: SupabaseClient, status: AuditStatus, fields: Record<string, any>) {
  try {
    await admin.from("ai_call_audit").insert({
      status,
      job_type: fields.job_type,
      provider: fields.provider ?? null,
      key_source: fields.key_source ?? null,
      model_used: fields.model_used ?? null,
      input_tokens: fields.input_tokens ?? null,
      output_tokens: fields.output_tokens ?? null,
      estimated_cost_usd: fields.estimated_cost_usd ?? null,
      prompt_version: fields.prompt_version ?? null,
      source_hash: fields.source_hash ?? null,
      confidence: fields.confidence ?? null,
      skipped_reason: fields.skipped_reason ?? null,
      error_message: fields.error_message ? String(fields.error_message).slice(0, 800) : null,
      latency_ms: fields.latency_ms ?? null,
      target_type: fields.target_type ?? null,
      target_id: fields.target_id ? String(fields.target_id) : null,
      meta: safeMeta(fields.meta),
    });
  } catch (_) {
    // Never let audit failures crash the runner.
  }
}

export const aiAudit = {
  logOk: (admin: SupabaseClient, f: OkAuditFields) => writeAudit(admin, "ok", f),
  logError: (admin: SupabaseClient, f: ErrorAuditFields) => writeAudit(admin, "error", f),
  logSkipped: (admin: SupabaseClient, f: SkippedAuditFields) =>
    writeAudit(admin, "skipped", { ...f, estimated_cost_usd: 0 }),
};

// ---------- timed wrapper ----------

export async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latency_ms: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, latency_ms: Date.now() - t0 };
}

// ---------- per-job daily spend ----------

// Reads today's per-job spent USD from ai_spend_daily.by_kind. We accept both
// `<job>_usd` and `<job>` key formats since historical runners use either.
export async function getJobSpendUsd(admin: SupabaseClient, jobType: string): Promise<number> {
  const dayKey = new Date().toISOString().slice(0, 10);
  const { data } = await admin.from("ai_spend_daily").select("by_kind").eq("day", dayKey).maybeSingle();
  const bk = (data?.by_kind || {}) as Record<string, any>;
  const a = Number(bk[`${jobType}_usd`] || 0);
  const b = Number(bk[jobType] || 0);
  // Use whichever is set (newer runners write `_usd`).
  return Math.max(a, b);
}

// ---------- preflight ----------

// One-call check: model allowed AND under daily cap (total + optional per-job).
// Returns null if OK, or a { reason } that the caller should logSkipped with.
export async function preflight(
  admin: SupabaseClient,
  model: string,
  budgetOrJobType?: BudgetSettings | string,
  jobTypeArg?: string,
): Promise<{ blocked: boolean; reason?: string; budget: BudgetSettings; spent: number }> {
  // Back-compat: preflight(admin, model) or preflight(admin, model, budget) or preflight(admin, model, jobType)
  let budget: BudgetSettings | undefined;
  let jobType: string | undefined;
  if (typeof budgetOrJobType === "string") jobType = budgetOrJobType;
  else if (budgetOrJobType) budget = budgetOrJobType;
  if (jobTypeArg) jobType = jobTypeArg;

  const b = budget || (await loadBudget(admin));
  const cap = await isWithinDailyCap(admin, b);
  if (!cap.ok) return { blocked: true, reason: "daily_cap_reached", budget: b, spent: cap.spent };
  const m = isModelAllowed(model, b);
  if (!m.ok) return { blocked: true, reason: m.reason, budget: b, spent: cap.spent };
  // Per-job soft cap
  if (jobType && b.per_job_caps_usd && b.per_job_caps_usd[jobType] != null) {
    const jobCap = Number(b.per_job_caps_usd[jobType]);
    if (jobCap > 0) {
      const jobSpent = await getJobSpendUsd(admin, jobType);
      if (jobSpent >= jobCap) {
        return { blocked: true, reason: `job_cap_reached:${jobType}`, budget: b, spent: cap.spent };
      }
    }
  }
  return { blocked: false, budget: b, spent: cap.spent };
}
