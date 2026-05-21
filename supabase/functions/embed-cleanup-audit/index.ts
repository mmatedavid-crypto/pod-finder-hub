// Audits how much cleanText would change the existing episodes.description corpus.
// Read-only over episodes. Streams in keyset-paginated batches until time budget.
// Persists rolling state at app_settings.embed_cleanup_audit so multiple invocations
// can resume from where the previous one stopped.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// ---- cleanText (MUST stay in sync with embed-episode-runner CLEANER_VERSION v1) ----
const SPONSOR_PATTERNS = [
  /free\s+subscription[^.\n]*/gi,
  /subscribe\s+(?:to|on|now|here|today)[^.\n]*/gi,
  /follow\s+us\s+on[^.\n]*/gi,
  /listen\s+on\s+(?:apple|spotify|google|amazon|youtube)[^.\n]*/gi,
  /available\s+on\s+(?:apple|spotify|google|amazon|youtube)[^.\n]*/gi,
  /(?:apple\s+podcasts?|spotify|patreon|youtube|instagram|facebook|twitter|tiktok|linkedin)\s*[:\-➟→»►▶]+[^\n]*/gi,
  /(?:bit\.ly|linktr\.ee|t\.co|tinyurl|buff\.ly)\/\S+/gi,
  /#[A-Za-z0-9_]{2,40}/g,
  /\bfbclid=\S+/gi,
  /\butm_\w+=\S+/gi,
];
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+/gi;
const HANDLE_RE = /(?:^|\s)@[\w.]{2,}/g;
const HTML_TAG_RE = /<[^>]+>/g;
const HTML_ENTITY_RE = /&(?:nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/gi;
const EMOJI_RUN_RE = /(?:\p{Extended_Pictographic}|\p{Emoji_Component}){2,}/gu;

function cleanText(raw: string): string {
  if (!raw) return "";
  let s = String(raw);
  s = s.replace(HTML_TAG_RE, " ").replace(HTML_ENTITY_RE, " ");
  s = s.replace(URL_RE, " ").replace(EMAIL_RE, " ").replace(HANDLE_RE, " ");
  for (const re of SPONSOR_PATTERNS) s = s.replace(re, " ");
  s = s.replace(EMOJI_RUN_RE, " ");
  s = s.replace(/[\u2022\u25CF\u25A0\u25B6\u2192\u27A4\u279C\u279E]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const KEY = "embed_cleanup_audit";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const t0 = Date.now();
  const TIME_BUDGET = 55_000;
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.max(500, Math.min(10_000, Number(body.batch) || 5000));
    const reset = body.reset === true;

    const { data: stateRow } = await admin.from("app_settings").select("value").eq("key", KEY).maybeSingle();
    const prev = (stateRow?.value as any) || {};
    let state = reset ? {} as any : prev;

    let cursor: string | null = state.cursor_id ?? null;
    let scanned = Number(state.scanned || 0);
    const buckets = state.buckets || {
      unchanged: 0, minor: 0, moderate: 0, major: 0, severe: 0,
      no_description: 0, would_skip: 0,
    };
    const totals = state.totals || { raw_chars: 0, clean_chars: 0 };
    const samples: any[] = Array.isArray(state.samples) ? state.samples : [];

    let processedThisRun = 0;
    let done = false;

    while (Date.now() - t0 < TIME_BUDGET) {
      let q = admin.from("episodes").select("id,title,description").order("id", { ascending: true }).limit(batchSize);
      if (cursor) q = q.gt("id", cursor);
      const { data: rows, error } = await q;
      if (error) throw error;
      if (!rows || rows.length === 0) { done = true; break; }

      for (const r of rows) {
        scanned++; processedThisRun++;
        const raw = r.description || "";
        const rawLen = raw.length;
        if (rawLen === 0) { buckets.no_description++; continue; }
        const cleaned = cleanText(raw);
        const cleanLen = cleaned.length;
        totals.raw_chars += rawLen;
        totals.clean_chars += cleanLen;
        const removedPct = rawLen > 0 ? (rawLen - cleanLen) / rawLen : 0;
        if (cleanLen < 60) buckets.would_skip++;
        if (removedPct <= 0.001) buckets.unchanged++;
        else if (removedPct < 0.10) buckets.minor++;
        else if (removedPct < 0.30) buckets.moderate++;
        else if (removedPct < 0.70) buckets.major++;
        else buckets.severe++;

        if ((removedPct >= 0.30) && samples.length < 30 && Math.random() < 0.02) {
          samples.push({
            id: r.id,
            title: String(r.title || "").slice(0, 80),
            raw_len: rawLen,
            clean_len: cleanLen,
            removed_pct: Number(removedPct.toFixed(3)),
            raw_head: raw.slice(0, 240),
            clean_head: cleaned.slice(0, 240),
          });
        }
      }
      cursor = rows[rows.length - 1].id;
      if (rows.length < batchSize) { done = true; break; }
    }

    const out = {
      cursor_id: cursor,
      scanned,
      buckets,
      totals,
      avg_removed_pct: totals.raw_chars > 0
        ? Number(((totals.raw_chars - totals.clean_chars) / totals.raw_chars).toFixed(4))
        : 0,
      samples,
      done,
      updated_at: new Date().toISOString(),
      last_run_ms: Date.now() - t0,
      last_processed: processedThisRun,
    };
    await admin.from("app_settings").upsert({
      key: KEY, value: out as any, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    return json({ ok: true, ...out });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
