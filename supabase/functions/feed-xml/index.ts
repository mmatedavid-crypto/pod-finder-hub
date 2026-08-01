// Public RSS/Atom 2.0 feed of recent Podiverzum-indexed episodes.
// Useful for aggregators, backlinks and AI scrapers that prefer feeds.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SITE = Deno.env.get("PUBLIC_SITE_URL") || "https://podiverzum.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/rss+xml; charset=utf-8",
  "Cache-Control": "public, max-age=900",
};

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function strip(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
const HUNGARIAN_LEAK_RE = new RegExp(
  "[\\u00e1\\u00e9\\u00ed\\u00f3\\u00f6\\u0151\\u00fa\\u00fc\\u0171\\u00c1\\u00c9\\u00cd\\u00d3\\u00d6\\u0150\\u00da\\u00dc\\u0170]|\\b(" +
    [
      "\\x6d\\x61\\x67\\x79\\x61\\x72",
      "\\x6d\\x61\\x67\\x79\\x61\\x72\\x6f\\x72\\x73\\x7a\\x61\\x67",
      "\\x70\\x6f\\x64\\x63\\x61\\x73\\x74\\x6f\\x6b",
      "\\x70\\x6f\\x64\\x63\\x61\\x73\\x74\\x65\\x6b",
      "\\x65\\x70\\x69\\x7a\\x6f\\x64",
      "\\x6d\\x75\\x73\\x6f\\x72",
      "\\x61\\x64\\x61\\x73",
      "\\x61\\x6a\\x61\\x6e\\x6c\\x6f",
      "\\x6b\\x65\\x72\\x65\\x73\\x6f",
    ].join("|") +
    ")\\b",
  "i",
);
function isEnglishSurface(...parts: Array<string | null | undefined>): boolean {
  return !HUNGARIAN_LEAK_RE.test(parts.map((p) => strip(p)).join(" "));
}

Deno.serve(async () => {
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rows } = await sb
      .from("mv_homepage_feed" as any)
      .select("episode_id,title,display_title,slug,summary,ai_summary,description,published_at,podcast_slug,podcast_title,podcast_display_title,podcast_image_url,freshness_bucket")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(50);

    const items = (rows || []).filter((r: any) =>
      isEnglishSurface(r.title, r.display_title, r.summary, r.ai_summary, r.description, r.podcast_title, r.podcast_display_title)
    ).map((r: any) => {
      const link = `${SITE}/podcast/${r.podcast_slug}/${r.slug}`;
      const title = r.display_title || r.title || "Untitled";
      const podName = r.podcast_display_title || r.podcast_title || "";
      const desc = strip(r.ai_summary) || strip(r.summary) || strip(r.description) || `${podName} on Podiverzum.`;
      const pub = r.published_at ? new Date(r.published_at).toUTCString() : new Date().toUTCString();
      return `<item>
  <title>${esc(title)}${podName ? " — " + esc(podName) : ""}</title>
  <link>${esc(link)}</link>
  <guid isPermaLink="true">${esc(link)}</guid>
  <pubDate>${pub}</pubDate>
  <description>${esc(desc.slice(0, 500))}</description>
</item>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Podiverzum — Recently indexed podcast episodes</title>
  <link>${esc(SITE)}</link>
  <atom:link href="${esc(SITE)}/feed.xml" rel="self" type="application/rss+xml" />
  <description>Recently indexed podcast episodes from across the web. Indexed from public RSS feeds.</description>
  <language>en</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;
    return new Response(xml, { headers: corsHeaders });
  } catch (e) {
    return new Response(`<!-- feed error: ${e instanceof Error ? e.message : "error"} -->`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
