// YouTube URL backfill runner
// For S/A tier episodes without a youtube_url, runs a YouTube Data API v3 search.list query
// (podcast title + episode title) and fuzzy-matches the top result. On match, sets episodes.youtube_url
// so transcript-scout-runner can pick up YT captions on the next pass.
//
// Cost model: 100 units / search.list call. Free quota 10k/day → ~100 episodes/day.
// On 403 quotaExceeded the runner stops, marks status='quota_exhausted', and sets next_attempt_at = +24h.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkBackgroundJobsAllowed } from "../_shared/incident-guard.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MATCH_THRESHOLD = 0.45;
const RETRY_BACKOFF_DAYS = [14, 60]; // attempt 1 fail → +14d, attempt 2 fail → +60d, then not_available

function normalizeTitle(s: string): string {
  return s.toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ep|episode|pt|part|with|w|feat|featuring|on|the|a|an|and|of|to|in|for|by)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}
function tokens(s: string): Set<string> {
  return new Set(normalizeTitle(s).split(" ").filter((t) => t.length >= 3));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

type YTSearchResult = { videoId: string; title: string; channelTitle: string; channelId: string };
const CHANNEL_PROMOTE_THRESHOLD = 0.7; // only promote channel URL to podcast if match is high-confidence

async function ytSearch(apiKey: string, query: string): Promise<{ items: YTSearchResult[]; quotaExhausted?: boolean; error?: string }> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "3");
  url.searchParams.set("q", query.slice(0, 100));
  url.searchParams.set("key", apiKey);
  const res = await fetch(url.toString());
  if (res.status === 403) {
    const body = await res.text();
    if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(body)) {
      return { items: [], quotaExhausted: true, error: "quota_exceeded" };
    }
    return { items: [], error: `403: ${body.slice(0, 200)}` };
  }
  if (!res.ok) return { items: [], error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  const items: YTSearchResult[] = (data?.items || []).map((it: any) => ({
    videoId: it?.id?.videoId,
    title: it?.snippet?.title || "",
    channelTitle: it?.snippet?.channelTitle || "",
  })).filter((x: YTSearchResult) => x.videoId);
  return { items };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 55_000;

  try {
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) return json({ error: "YOUTUBE_API_KEY not configured" }, 500);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const guard = await checkBackgroundJobsAllowed(admin, "yt-backfill-runner");
    if (guard.blocked) return json({ ok: true, skipped: true, reason: guard.reason });

    const body = await req.json().catch(() => ({}));
    const { data: ctrlRow } = await admin.from("app_settings").select("value").eq("key", "yt_backfill_controls").maybeSingle();
    const ctrl = (ctrlRow?.value || {}) as any;
    if (ctrl.enabled === false) return json({ ok: true, paused: true });

    // Daily quota guard: stop after N calls in a calendar UTC day to leave headroom
    const dailyCap = Math.max(10, Math.min(95, Number(ctrl.daily_call_cap) || 90));
    const todayKey = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await admin.from("app_settings").select("value").eq("key", "yt_backfill_usage").maybeSingle();
    const usage = (usageRow?.value || {}) as any;
    let callsToday = usage?.date === todayKey ? Number(usage.calls || 0) : 0;
    if (callsToday >= dailyCap) {
      return json({ ok: true, skipped: true, reason: "daily_cap_reached", calls_today: callsToday });
    }

    const batch = Math.max(1, Math.min(50, Number(body.batch) || dailyCap - callsToday));
    const { data: candRows, error: candErr } = await admin.rpc("select_yt_backfill_candidates", { _limit: batch });
    if (candErr) throw candErr;
    const candidates: any[] = (candRows as any[]) || [];

    let processed = 0, matched = 0, notMatched = 0, errors = 0, quotaHit = false;
    const errorSamples: any[] = [];

    for (const e of candidates) {
      if (Date.now() - startedAt > TIME_BUDGET_MS - 4_000) break;
      if (callsToday >= dailyCap) break;
      processed++;
      const epTitle = String(e.episode_title || "").slice(0, 200);
      const pdTitle = String(e.podcast_title || "").slice(0, 100);
      const query = `${pdTitle} ${epTitle}`.replace(/\s+/g, " ").trim();
      try {
        const r = await ytSearch(apiKey, query);
        callsToday++;
        if (r.quotaExhausted) {
          quotaHit = true;
          // Reschedule this episode for tomorrow
          await admin.from("yt_url_backfill_attempts").upsert({
            episode_id: e.id, podcast_id: e.podcast_id,
            status: "pending",
            next_attempt_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "episode_id" });
          break;
        }
        if (r.error) {
          errors++;
          if (errorSamples.length < 5) errorSamples.push({ id: e.id, error: r.error });
          continue;
        }
        const epTok = tokens(epTitle);
        const pdTok = tokens(pdTitle);
        let best: { videoId: string; score: number } | null = null;
        for (const item of r.items) {
          const titleTok = tokens(item.title);
          const channelTok = tokens(item.channelTitle);
          const titleScore = jaccard(epTok, titleTok);
          const channelScore = jaccard(pdTok, channelTok);
          // Combined: title is dominant, but channel match acts as a tiebreaker / confidence boost
          const score = titleScore * 0.75 + channelScore * 0.25;
          if (!best || score > best.score) best = { videoId: item.videoId, score };
        }
        const { data: existing } = await admin.from("yt_url_backfill_attempts").select("attempts").eq("episode_id", e.id).maybeSingle();
        const attemptCount = Number(existing?.attempts || 0) + 1;
        if (best && best.score >= MATCH_THRESHOLD) {
          const ytUrl = `https://www.youtube.com/watch?v=${best.videoId}`;
          await admin.from("episodes").update({
            youtube_url: ytUrl,
            updated_at: new Date().toISOString(),
          }).eq("id", e.id);
          await admin.from("yt_url_backfill_attempts").upsert({
            episode_id: e.id, podcast_id: e.podcast_id,
            attempts: attemptCount, status: "found",
            last_attempt_at: new Date().toISOString(),
            next_attempt_at: null,
            matched_video_id: best.videoId,
            match_score: best.score,
            updated_at: new Date().toISOString(),
          }, { onConflict: "episode_id" });
          // Nudge transcript scout to recheck this episode
          await admin.from("episodes").update({
            transcript_status: null,
            next_transcript_check_at: null,
          }).eq("id", e.id).is("transcript_status", "not_available");
          matched++;
        } else {
          const finalize = attemptCount >= RETRY_BACKOFF_DAYS.length + 1;
          const nextAt = finalize ? null : new Date(Date.now() + RETRY_BACKOFF_DAYS[attemptCount - 1] * 86_400_000).toISOString();
          const status = finalize ? "not_available" : "failed";
          await admin.from("yt_url_backfill_attempts").upsert({
            episode_id: e.id, podcast_id: e.podcast_id,
            attempts: attemptCount, status,
            last_attempt_at: new Date().toISOString(),
            next_attempt_at: nextAt,
            match_score: best?.score || 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: "episode_id" });
          notMatched++;
        }
      } catch (err: any) {
        errors++;
        if (errorSamples.length < 5) errorSamples.push({ id: e.id, error: String(err?.message || err).slice(0, 200) });
      }
    }

    await admin.from("app_settings").upsert({
      key: "yt_backfill_usage",
      value: { date: todayKey, calls: callsToday, quota_hit: quotaHit, updated_at: new Date().toISOString() } as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    const { data: statsRows } = await admin.rpc("yt_backfill_stats");
    const s = (statsRows as any[])?.[0] || {};
    const pending = Number(s.pending || 0);

    // Adaptive cron: tied to remaining daily quota + pending pool
    let recommended: string;
    if (quotaHit || callsToday >= dailyCap) recommended = "0 4 * * *"; // daily once after quota reset
    else if (pending > 1000) recommended = "*/30 * * * *";
    else if (pending > 200) recommended = "0 * * * *";
    else if (pending > 50) recommended = "0 */2 * * *";
    else if (pending > 0) recommended = "0 */6 * * *";
    else recommended = "0 4 * * *";
    try { await admin.rpc("set_yt_backfill_schedule" as any, { _schedule: recommended }); } catch { /* */ }

    const progress = {
      last_run_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      processed, matched, not_matched: notMatched, errors,
      quota_hit: quotaHit, calls_today: callsToday, daily_cap: dailyCap,
      stats: s, cron_schedule: recommended, error_samples: errorSamples,
    };
    await admin.from("app_settings").upsert({
      key: "yt_backfill_progress", value: progress as any, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    return json({ ok: true, processed, matched, not_matched: notMatched, errors, quota_hit: quotaHit, calls_today: callsToday, schedule: recommended });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
