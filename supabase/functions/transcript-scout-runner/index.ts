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
// Cached per-invocation: one HTTP fetch per feed even when 50 episodes of the same podcast queue up.
type FeedItems = Array<{ guid?: string; link?: string; enclosure?: string; transcriptUrl?: string; transcriptType?: string }>;
const _feedCache = new Map<string, FeedItems | null>();

async function getFeedItems(podcastRssUrl: string): Promise<FeedItems | null> {
  if (!podcastRssUrl) return null;
  if (_feedCache.has(podcastRssUrl)) return _feedCache.get(podcastRssUrl) ?? null;
  try {
    const res = await fetchWithTimeout(podcastRssUrl, {
      headers: { "User-Agent": "PodiverzumScout/1.0 (+https://podiverzum.com)" },
    });
    if (!res.ok) { _feedCache.set(podcastRssUrl, null); return null; }
    const xml = await readCapped(res, MAX_RSS_BYTES);
    if (!xml || !/podcast:transcript/i.test(xml)) { _feedCache.set(podcastRssUrl, null); return null; }
    const items: FeedItems = (xml.match(/<item\b[\s\S]*?<\/item>/gi) || []).map((item) => {
      const g = item.match(/<guid[^>]*>([^<]+)<\/guid>/i)?.[1]?.trim();
      const l = item.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1]?.trim();
      const enc = item.match(/<enclosure[^>]*url\s*=\s*"([^"]+)"/i)?.[1]?.trim();
      const tr = item.match(/<podcast:transcript\s+([^>]+)\/?>/i)?.[1];
      const trUrl = tr?.match(/url\s*=\s*"([^"]+)"/i)?.[1];
      const trType = tr?.match(/type\s*=\s*"([^"]+)"/i)?.[1];
      return { guid: g, link: l, enclosure: enc, transcriptUrl: trUrl, transcriptType: trType };
    });
    _feedCache.set(podcastRssUrl, items);
    return items;
  } catch {
    _feedCache.set(podcastRssUrl, null);
    return null;
  }
}

async function findRssTranscript(podcastRssUrl: string, episodeGuid: string | null, episodeUrl: string | null, audioUrl: string | null) {
  const items = await getFeedItems(podcastRssUrl);
  if (!items) return null;
  for (const it of items) {
    const matchesEpisode =
      (episodeGuid && it.guid === episodeGuid) ||
      (episodeUrl && it.link === episodeUrl) ||
      (audioUrl && it.enclosure === audioUrl);
    if (!matchesEpisode) continue;
    if (!it.transcriptUrl) return null;
    return { url: it.transcriptUrl, type: it.transcriptType || "" };
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
  const body = await readCapped(res, MAX_TRANSCRIPT_BYTES);
  if (!body) return null;
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

// --- Website scout: fetch the episode page, look for transcript links or inline transcript sections.
// $0 cost (plain HTTP). Per-host failure cache prevents hammering sites that don't publish transcripts.
const MAX_PAGE_BYTES = 1_500_000; // 1.5 MB cap for episode page HTML
const _hostFailures = new Map<string, number>();
const HOST_FAIL_LIMIT = 3; // after 3 consecutive misses in one run, skip this host for rest of run

function hostOf(url: string): string {
  try { return new URL(url).host.toLowerCase(); } catch { return ""; }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlBlockToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  ).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function extractInlineTranscript(html: string): string | null {
  // Look for a container whose class/id contains "transcript" — common patterns on podcast sites
  // (Lex Fridman, Tim Ferriss blog posts, Huberman, NPR-style transcripts).
  const re = /<(article|section|div)\b[^>]*\b(?:class|id)\s*=\s*"[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi;
  let best = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = htmlBlockToText(m[2]);
    if (text.length > best.length) best = text;
    if (best.length > 50_000) break;
  }
  if (best.length >= 1000) return best;
  return null;
}

function findTranscriptLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const linkRe = /<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    const label = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).toLowerCase();
    const hrefLow = href.toLowerCase();
    const looksLikeTranscript =
      /transcript/.test(hrefLow) || /transcript/.test(label) ||
      /\.(srt|vtt)(\?|$)/.test(hrefLow);
    if (!looksLikeTranscript) continue;
    // Skip obvious non-transcript false positives
    if (/\.(jpg|jpeg|png|gif|webp|mp3|mp4|m4a|wav)(\?|$)/.test(hrefLow)) continue;
    let abs: string;
    try { abs = new URL(href, baseUrl).toString(); } catch { continue; }
    if (seen.has(abs)) continue;
    seen.add(abs);
    // PDFs: skip — too costly/complex to parse here ($0 budget)
    if (/\.pdf(\?|$)/i.test(abs)) continue;
    out.push(abs);
    if (out.length >= 3) break;
  }
  return out;
}

async function findWebsiteTranscript(episodeUrl: string | null) {
  if (!episodeUrl) return null;
  const host = hostOf(episodeUrl);
  if (!host) return null;
  if ((_hostFailures.get(host) || 0) >= HOST_FAIL_LIMIT) return null;
  let html: string;
  try {
    const res = await fetchWithTimeout(episodeUrl, {
      headers: { "User-Agent": "PodiverzumScout/1.0 (+https://podiverzum.com)" },
    });
    if (!res.ok) { _hostFailures.set(host, (_hostFailures.get(host) || 0) + 1); return null; }
    const body = await readCapped(res, MAX_PAGE_BYTES);
    if (!body) { _hostFailures.set(host, (_hostFailures.get(host) || 0) + 1); return null; }
    html = body;
  } catch {
    _hostFailures.set(host, (_hostFailures.get(host) || 0) + 1);
    return null;
  }

  // 1. Inline transcript block
  const inline = extractInlineTranscript(html);
  if (inline && inline.length >= 1000) {
    _hostFailures.set(host, 0);
    return { url: episodeUrl, text: inline.slice(0, 200_000), format: "txt" };
  }

  // 2. Transcript link(s) on the page
  const links = findTranscriptLinks(html, episodeUrl);
  for (const link of links) {
    const parsed = await fetchAndParseTranscript(link);
    if (parsed?.text) {
      _hostFailures.set(host, 0);
      return { url: link, text: parsed.text, format: parsed.format };
    }
  }

  _hostFailures.set(host, (_hostFailures.get(host) || 0) + 1);
  return null;
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

    let processed = 0, foundRss = 0, foundYt = 0, foundWeb = 0, notAvailable = 0, failed = 0, errors = 0;
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
          // Fallback 2: publisher website (episode page scrape)
          if (!result && e.episode_url) {
            const web = await findWebsiteTranscript(e.episode_url);
            if (web) {
              result = { source: "website", url: web.url, format: web.format, text: web.text };
              foundWeb++;
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
