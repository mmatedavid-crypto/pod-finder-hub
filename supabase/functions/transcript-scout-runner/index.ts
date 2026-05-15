// Transcript Scout: looks for existing transcripts (no ASR cost).
// Sources, in priority order:
//   1. RSS <podcast:transcript> tag (Podcast namespace 1.0)
//   2. YouTube auto-captions (when youtube_url is present)
// Restricted to S/A tier podcasts. Backoff: 7d, 30d, then mark not_available.
// Stores plain text in episode_transcripts; downstream embed-chunks-runner picks it up.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkBackgroundJobsAllowed } from "../_shared/incident-guard.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_TRANSCRIPT_BYTES = 250_000; // 250 KB cap per transcript
const MAX_RSS_BYTES = 2_000_000;       // 2 MB cap per RSS feed
const FETCH_TIMEOUT_MS = 8_000;

// Streaming reader with hard byte cap. Avoids OOM on large RSS / transcripts.
async function readCapped(res: Response, cap: number): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  let total = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > cap) { try { reader.cancel(); } catch {} return null; }
    parts.push(value);
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { merged.set(p, off); off += p.length; }
  return new TextDecoder().decode(merged);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeout = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function srtVttToText(s: string): string {
  return s
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^\d+$/.test(t)) return false; // SRT index
      if (/-->/.test(t)) return false; // timecode
      if (/^WEBVTT/i.test(t)) return false;
      if (/^NOTE\b/.test(t)) return false;
      if (/^STYLE\b/i.test(t)) return false;
      return true;
    })
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .join(" ");
}

function jsonTranscriptToText(jsonStr: string): string {
  try {
    const obj = JSON.parse(jsonStr);
    // Common shapes:
    //   { segments: [{ body: "...", speaker: "..." }] }  (Podcast namespace JSON)
    //   { events: [{ segs: [{utf8: "..."}] }] }           (YouTube timedtext json3)
    if (Array.isArray(obj?.segments)) {
      return obj.segments.map((s: any) => String(s.body || s.text || "")).join(" ").trim();
    }
    if (Array.isArray(obj?.events)) {
      return obj.events
        .flatMap((ev: any) => Array.isArray(ev.segs) ? ev.segs.map((s: any) => s.utf8 || "") : [])
        .join(" ").replace(/\s+/g, " ").trim();
    }
    if (typeof obj?.text === "string") return obj.text;
    return "";
  } catch { return ""; }
}

function detectFormat(contentType: string | null, body: string, url: string): string {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("application/json") || ct.includes("application/json+podcast") || /^[\s]*[\[{]/.test(body)) return "json";
  if (ct.includes("vtt") || /^WEBVTT/i.test(body) || url.endsWith(".vtt")) return "vtt";
  if (ct.includes("srt") || /\b\d+\s+\d{2}:\d{2}:\d{2}/.test(body) || url.endsWith(".srt")) return "srt";
  return "txt";
}

// --- RSS scout: parse podcast feed, find <podcast:transcript url="..." type="..."/> on matching item.
async function findRssTranscript(podcastRssUrl: string, episodeGuid: string | null, episodeUrl: string | null, audioUrl: string | null) {
  if (!podcastRssUrl) return null;
  const res = await fetchWithTimeout(podcastRssUrl, {
    headers: { "User-Agent": "PodiverzumScout/1.0 (+https://podiverzum.com)" },
  });
  if (!res.ok) return null;
  const xml = await readCapped(res, MAX_RSS_BYTES);
  if (!xml) return null;
  // Quick rejection: skip feeds with no transcript tag at all
  if (!/podcast:transcript/i.test(xml)) return null;

  // Split items
  const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
  const items = xml.match(itemRegex) || [];
  for (const item of items) {
    const matches = (() => {
      const m: { guid?: string; link?: string; enclosure?: string } = {};
      const g = item.match(/<guid[^>]*>([^<]+)<\/guid>/i); if (g) m.guid = g[1].trim();
      const l = item.match(/<link[^>]*>([^<]+)<\/link>/i); if (l) m.link = l[1].trim();
      const e = item.match(/<enclosure[^>]*url\s*=\s*"([^"]+)"/i); if (e) m.enclosure = e[1].trim();
      return m;
    })();
    const matchesEpisode =
      (episodeGuid && matches.guid === episodeGuid) ||
      (episodeUrl && matches.link === episodeUrl) ||
      (audioUrl && matches.enclosure === audioUrl);
    if (!matchesEpisode) continue;

    const trMatch = item.match(/<podcast:transcript\s+([^>]+)\/?>/i);
    if (!trMatch) return null;
    const attrs = trMatch[1];
    const urlAttr = attrs.match(/url\s*=\s*"([^"]+)"/i)?.[1];
    const typeAttr = attrs.match(/type\s*=\s*"([^"]+)"/i)?.[1];
    if (!urlAttr) return null;
    return { url: urlAttr, type: typeAttr || "" };
  }
  return null;
}

async function fetchAndParseTranscript(url: string): Promise<{ text: string; format: string } | null> {
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "PodiverzumScout/1.0 (+https://podiverzum.com)" },
  });
  if (!res.ok) return null;
  const cl = Number(res.headers.get("content-length") || "0");
  if (cl > MAX_TRANSCRIPT_BYTES) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > MAX_TRANSCRIPT_BYTES) { try { reader.cancel(); } catch {} ; return null; }
      chunks.push(value);
    }
  }
  const body = new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => Array.from(c))));
  const format = detectFormat(res.headers.get("content-type"), body, url);
  let text = "";
  if (format === "json") text = jsonTranscriptToText(body);
  else if (format === "srt" || format === "vtt") text = srtVttToText(body);
  else text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 200) return null;
  return { text, format };
}

// --- YouTube scout: extract video ID, hit timedtext API for English caption track.
function extractYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m?.[1] || null;
}

async function findYouTubeTranscript(youtubeUrl: string | null) {
  const vid = extractYouTubeId(youtubeUrl);
  if (!vid) return null;
  // List available caption tracks
  const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${vid}`;
  const listRes = await fetchWithTimeout(listUrl);
  if (!listRes.ok) return null;
  const listXml = await listRes.text();
  if (!/<track\b/.test(listXml)) return null;
  // Prefer English (auto or manual)
  const tracks = [...listXml.matchAll(/<track\s+([^/]+)\/?>/g)].map((m) => {
    const attrs: any = {};
    for (const kv of m[1].matchAll(/(\w+)="([^"]*)"/g)) attrs[kv[1]] = kv[2];
    return attrs;
  });
  const en = tracks.find((t) => /^en/i.test(t.lang_code || "")) || tracks[0];
  if (!en) return null;
  const params = new URLSearchParams({ v: vid, lang: en.lang_code || "en" });
  if (en.name) params.set("name", en.name);
  params.set("fmt", "json3");
  const capUrl = `https://www.youtube.com/api/timedtext?${params.toString()}`;
  const capRes = await fetchWithTimeout(capUrl);
  if (!capRes.ok) return null;
  const body = await capRes.text();
  if (!body || body.length < 50) return null;
  const text = jsonTranscriptToText(body);
  if (text.length < 200) return null;
  return { url: capUrl, text, format: "json", language: en.lang_code || "en" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 55_000;

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const guard = await checkBackgroundJobsAllowed(admin, "transcript-scout-runner");
    if (guard.blocked) return json({ ok: true, skipped: true, reason: guard.reason });
    const body = await req.json().catch(() => ({}));

    const { data: ctrlRow } = await admin.from("app_settings").select("value").eq("key", "transcript_scout_controls").maybeSingle();
    const ctrl = (ctrlRow?.value || {}) as any;
    if (ctrl.enabled === false) return json({ ok: true, paused: true });
    const batch = Math.max(1, Math.min(200, Number(body.batch) || Number(ctrl.batch_size) || 50));
    const concurrency = Math.max(1, Math.min(12, Number(body.concurrency) || Number(ctrl.concurrency) || 4));
    const backoffDays: number[] = Array.isArray(ctrl.backoff_days) ? ctrl.backoff_days : [7, 30];

    let processed = 0, foundRss = 0, foundYt = 0, notAvailable = 0, failed = 0, errors = 0;
    const errorSamples: any[] = [];
    let drainPasses = 0;
    let stop = false;

    while (!stop) {
      if (Date.now() - startedAt > TIME_BUDGET_MS - 6_000) break;

      const { data: candRows, error: candErr } = await admin.rpc("select_transcript_scout_candidates", { _limit: batch });
      if (candErr) throw candErr;
      const candidates: any[] = (candRows as any[]) || [];
      if (candidates.length === 0) break;
      drainPasses++;

      let i = 0;
      const runOne = async (e: any) => {
        if (stop) return;
        if (Date.now() - startedAt > TIME_BUDGET_MS - 6_000) { stop = true; return; }
        processed++;
        try {
          // Try RSS first
          let result: { source: string; url: string; format: string; text: string; language?: string } | null = null;
          if (e.podcast_rss_url) {
            const rss = await findRssTranscript(e.podcast_rss_url, e.guid, e.episode_url, e.audio_url);
            if (rss?.url) {
              const parsed = await fetchAndParseTranscript(rss.url);
              if (parsed?.text) {
                result = { source: "rss", url: rss.url, format: parsed.format, text: parsed.text };
                foundRss++;
              }
            }
          }
          // Fallback: YouTube
          if (!result && e.youtube_url) {
            const yt = await findYouTubeTranscript(e.youtube_url);
            if (yt) {
              result = { source: "youtube", url: yt.url, format: yt.format, text: yt.text, language: yt.language };
              foundYt++;
            }
          }

          if (result) {
            await admin.from("episode_transcripts").upsert({
              episode_id: e.id, podcast_id: e.podcast_id,
              source: result.source, transcript_url: result.url, format: result.format,
              text: result.text.slice(0, 200_000),
              word_count: result.text.split(/\s+/).filter(Boolean).length,
              language: result.language || null,
              status: "found",
              fetched_at: new Date().toISOString(),
              last_attempt_at: new Date().toISOString(),
              attempts: 1,
              updated_at: new Date().toISOString(),
            }, { onConflict: "episode_id" });
            // Mark episode for re-chunking on next embed run
            await admin.from("episodes").update({
              transcript_status: "found",
              chunks_status: "stale",
              updated_at: new Date().toISOString(),
            }).eq("id", e.id);
          } else {
            // No transcript found in any source. Decide whether to mark not_available or schedule retry.
            const { data: existing } = await admin.from("episode_transcripts")
              .select("attempts").eq("episode_id", e.id).maybeSingle();
            const attempts = Number(existing?.attempts || 0) + 1;
            const finalize = attempts >= backoffDays.length + 1;
            const nextAt = finalize ? null : new Date(Date.now() + backoffDays[attempts - 1] * 86_400_000).toISOString();
            const status = finalize ? "not_available" : "failed";
            await admin.from("episode_transcripts").upsert({
              episode_id: e.id, podcast_id: e.podcast_id,
              status, attempts,
              last_attempt_at: new Date().toISOString(),
              next_attempt_at: nextAt,
              updated_at: new Date().toISOString(),
            }, { onConflict: "episode_id" });
            await admin.from("episodes").update({
              transcript_status: status,
              next_transcript_check_at: nextAt,
              updated_at: new Date().toISOString(),
            }).eq("id", e.id);
            if (finalize) notAvailable++; else failed++;
          }
        } catch (err: any) {
          errors++;
          if (errorSamples.length < 5) errorSamples.push({ id: e.id, error: String(err?.message || err).slice(0, 200) });
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

    const { data: statsRows } = await admin.rpc("transcript_scout_stats");
    const s = (statsRows as any[])?.[0] || {};
    const unchecked = Number(s.unchecked || 0);

    let recommended: string;
    if (unchecked > 5000) recommended = "*/5 * * * *";
    else if (unchecked > 500) recommended = "*/10 * * * *";
    else if (unchecked > 50) recommended = "*/30 * * * *";
    else if (unchecked > 0) recommended = "0 * * * *";
    else recommended = "0 */6 * * *";
    if (errors > processed / 2 && processed > 0) {
      const stepDown: Record<string, string> = {
        "*/5 * * * *": "*/15 * * * *", "*/10 * * * *": "*/30 * * * *",
        "*/15 * * * *": "*/30 * * * *", "*/30 * * * *": "0 * * * *",
      };
      recommended = stepDown[recommended] || recommended;
    }
    try { await admin.rpc("set_transcript_scout_schedule" as any, { _schedule: recommended }); } catch { /* */ }

    const progress = {
      last_run_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      processed, found_rss: foundRss, found_youtube: foundYt,
      not_available: notAvailable, failed, errors, error_samples: errorSamples,
      drain_passes: drainPasses,
      stats: s,
      cron_schedule: recommended,
    };
    await admin.from("app_settings").upsert({
      key: "transcript_scout_progress", value: progress as any, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    return json({ ok: true, processed, found_rss: foundRss, found_youtube: foundYt, not_available: notAvailable, failed, errors, schedule: recommended });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
