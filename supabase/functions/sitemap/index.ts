// Dynamic sitemap built from the database.
// Routes:
//   GET /sitemap                       → sitemap-index (lists all sub-sitemaps)
//   GET /sitemap?type=core             → home, categories, category hubs, static pages
//   GET /sitemap?type=podcasts         → all healthy podcast detail pages
//   GET /sitemap?type=entities&ym=YYYY-MM → entity hubs (≥3 eps in that month)
//   GET /sitemap?type=episodes&ym=YYYY-MM → episode pages published that month
//
// Month buckets avoid Postgres deep-offset (statement_timeout) and keep
// every chunk under 45k URLs (Google's 50k limit).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SITE = Deno.env.get("PUBLIC_SITE_URL") || "https://podiverzum.com";
// Sub-sitemap URLs are emitted on the public domain so Cloudflare worker can
// proxy them and Google sees same-host children (best practice).
const FN_BASE = `${SITE}/sitemap.xml`;

const xmlHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
};

function urlTag(loc: string, lastmod?: string | null, changefreq = "daily", priority = "0.6") {
  return `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}
function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
function entSlug(kind: string, v: string) {
  if (kind === "ticker") return v.replace(/[^a-zA-Z0-9.]+/g, "").toUpperCase();
  return v.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}
const maxDate = (a?: string | null, b?: string | null) => {
  if (!a) return b || null;
  if (!b) return a || null;
  return new Date(a) >= new Date(b) ? a : b;
};
function wrapUrlset(urls: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}
// Episodes per sub-sitemap chunk. Google's hard limit is 50k URLs;
// 15k keeps us well under and lets crawlers process each chunk fast.
const EP_PER_PART = 15000;

function monthBounds(ym: string, part?: string | null, partsTotal?: number | null): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  const monthStartMs = Date.UTC(y, mo - 1, 1);
  const monthEndMs = Date.UTC(ny, nm - 1, 1);
  if (!part) return { start: new Date(monthStartMs).toISOString(), end: new Date(monthEndMs).toISOString() };
  const pIdx = parseInt(part, 10);
  const pTot = partsTotal && partsTotal > 0 ? partsTotal : 4;
  if (!Number.isFinite(pIdx) || pIdx < 1 || pIdx > pTot) return null;
  // Even time-slice across the month; works for any parts count (1..N).
  const sliceMs = (monthEndMs - monthStartMs) / pTot;
  const s = monthStartMs + sliceMs * (pIdx - 1);
  const e = pIdx === pTot ? monthEndMs : monthStartMs + sliceMs * pIdx;
  return { start: new Date(s).toISOString(), end: new Date(e).toISOString() };
}

interface MonthInfo { ym: string; n: number; lastmod?: string | null }

async function listMonths(supabase: ReturnType<typeof createClient>): Promise<MonthInfo[]> {
  // RPC returns (ym, n, max_updated_at) for months >= 2024-01 that contain at
  // least one episode from a healthy EN podcast. Empty/bogus months are excluded
  // entirely — no more 2014→present cartesian explosion.
  const { data, error } = await (supabase as any).rpc("sitemap_episode_month_counts");
  if (error) throw error;
  return ((data || []) as any[])
    .map((r) => ({ ym: r.ym as string, n: Number(r.n) || 0, lastmod: r.max_updated_at as string | null }))
    .filter((r) => r.n > 0);
}

async function buildSitemapIndex(supabase: ReturnType<typeof createClient>) {
  const months = await listMonths(supabase);
  const fallbackLastmod = new Date().toISOString();
  const entries: string[] = [
    `<sitemap><loc>${FN_BASE}?type=core</loc><lastmod>${fallbackLastmod}</lastmod></sitemap>`,
    `<sitemap><loc>${FN_BASE}?type=podcasts</loc><lastmod>${fallbackLastmod}</lastmod></sitemap>`,
  ];
  for (const m of months) {
    const lm = m.lastmod || fallbackLastmod;
    const parts = Math.max(1, Math.ceil(m.n / EP_PER_PART));
    if (parts === 1) {
      entries.push(`<sitemap><loc>${FN_BASE}?type=episodes&amp;ym=${m.ym}</loc><lastmod>${lm}</lastmod></sitemap>`);
    } else {
      for (let p = 1; p <= parts; p++) {
        entries.push(`<sitemap><loc>${FN_BASE}?type=episodes&amp;ym=${m.ym}&amp;part=${p}&amp;pt=${parts}</loc><lastmod>${lm}</lastmod></sitemap>`);
      }
    }
    // Entity hub sub-sitemap per month (surfaces topic/person/company pages).
    entries.push(`<sitemap><loc>${FN_BASE}?type=entities&amp;ym=${m.ym}</loc><lastmod>${lm}</lastmod></sitemap>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</sitemapindex>`;
}

async function buildCore(supabase: ReturnType<typeof createClient>) {
  const { data: cats } = await supabase.from("categories").select("slug,created_at");
  const urls: string[] = [
    urlTag(`${SITE}/`, null, "daily", "1.0"),
    urlTag(`${SITE}/categories`, null, "daily", "0.7"),
    urlTag(`${SITE}/topics`, null, "daily", "0.8"),
    urlTag(`${SITE}/people`, null, "daily", "0.8"),
    urlTag(`${SITE}/companies`, null, "daily", "0.8"),
    urlTag(`${SITE}/about`, null, "monthly", "0.4"),
    urlTag(`${SITE}/methodology`, null, "monthly", "0.4"),
    urlTag(`${SITE}/new-podcasts`, null, "daily", "0.6"),
  ];
  (cats || []).forEach((c: any) => urls.push(urlTag(`${SITE}/category/${esc(c.slug)}`, c.created_at, "daily", "0.8")));
  return wrapUrlset(urls);
}

async function buildPodcasts(supabase: ReturnType<typeof createClient>) {
  const SITEMAP_BAD = new Set(["needs_manual_rss_review", "quarantined_spam", "confirmed_dead"]);
  const urls: string[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data: pods, error } = await supabase
      .from("podcasts")
      .select("slug,updated_at,ai_enriched_at,rss_status,rank_label,shadow_rank_components,language")
      // EN-only sitemap: hide non-English shows from Google. NULL=EN (legacy untagged).
      .or("language.is.null,language.ilike.en%")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!pods || pods.length === 0) break;
    for (const p of pods as any[]) {
      const broken = p.rss_status === "failed" || p.rss_status === "inactive";
      const hs = (p.shadow_rank_components as any)?.health_state;
      if (broken || SITEMAP_BAD.has(hs) || p.rank_label === "E") continue;
      const tier = p.rank_label;
      const priority = tier === "S" ? "0.9" : tier === "A" ? "0.8" : tier === "B" ? "0.7" : tier === "C" ? "0.6" : "0.4";
      urls.push(urlTag(`${SITE}/podcast/${esc(p.slug)}`, maxDate(p.updated_at, p.ai_enriched_at), "daily", priority));
    }
    if (pods.length < PAGE) break;
    from += PAGE;
  }
  return wrapUrlset(urls);
}

async function buildEpisodesByMonth(supabase: ReturnType<typeof createClient>, ym: string, part?: string | null, partsTotal?: number | null) {
  const b = monthBounds(ym, part, partsTotal);
  if (!b) throw new Error(`bad ym: ${ym}`);
  const urls: string[] = [];
  let from = 0;
  const CHUNK = 1000;
  while (true) {
    const { data: eps, error } = await supabase
      .from("episodes")
      .select("slug,updated_at,ai_enriched_at,published_at,podcasts!inner(slug,rss_status,language)")
      .gte("published_at", b.start)
      .lt("published_at", b.end)
      // EN-only: hide non-English podcasts' episodes from sitemap.
      .or("language.is.null,language.ilike.en%", { referencedTable: "podcasts" })
      .order("published_at", { ascending: true })
      .range(from, from + CHUNK - 1);
    if (error) throw error;
    if (!eps || eps.length === 0) break;
    for (const e of eps as any[]) {
      const ps = e.podcasts?.slug;
      const broken = e.podcasts?.rss_status === "failed" || e.podcasts?.rss_status === "inactive";
      if (ps && !broken) urls.push(urlTag(`${SITE}/podcast/${esc(ps)}/${esc(e.slug)}`, maxDate(e.updated_at, e.ai_enriched_at), "weekly", "0.7"));
    }
    if (eps.length < CHUNK) break;
    from += CHUNK;
  }
  return wrapUrlset(urls);
}

async function buildEntitiesByMonth(supabase: ReturnType<typeof createClient>, ym: string) {
  const b = monthBounds(ym);
  if (!b) throw new Error(`bad ym: ${ym}`);
  const entCount: Record<string, { slug: string; n: number; lastmod?: string }> = {};
  const kinds: { col: "topics"|"people"|"companies"|"tickers"|"ingredients"; route: string }[] = [
    { col: "topics", route: "topic" }, { col: "people", route: "person" },
    { col: "companies", route: "company" }, { col: "tickers", route: "ticker" }, { col: "ingredients", route: "ingredient" },
  ];
  let from = 0;
  const CHUNK = 1000;
  while (true) {
    const { data: chunk, error } = await supabase
      .from("episodes")
      .select("updated_at,topics,people,companies,tickers,ingredients,podcasts!inner(rss_status,language)")
      .gte("published_at", b.start)
      .lt("published_at", b.end)
      // EN-only: skip entities derived from non-English shows.
      .or("language.is.null,language.ilike.en%", { referencedTable: "podcasts" })
      .order("published_at", { ascending: true })
      .range(from, from + CHUNK - 1);
    if (error) throw error;
    if (!chunk || chunk.length === 0) break;
    for (const e of chunk as any[]) {
      const broken = e.podcasts?.rss_status === "failed" || e.podcasts?.rss_status === "inactive";
      if (broken) continue;
      for (const { col, route } of kinds) {
        (e[col] || []).forEach((v: string) => {
          const s = entSlug(route, v);
          if (!s) return;
          const k = `${route}:${s}`;
          const cur = entCount[k];
          if (cur) cur.n++; else entCount[k] = { slug: s, n: 1, lastmod: e.updated_at };
        });
      }
    }
    if (chunk.length < CHUNK) break;
    from += CHUNK;
  }
  const urls: string[] = [];
  Object.entries(entCount).forEach(([key, info]) => {
    if (info.n < 3) return;
    const route = key.split(":")[0];
    const priority = info.n >= 20 ? "0.8" : "0.6";
    urls.push(urlTag(`${SITE}/${route}/${esc(info.slug)}`, info.lastmod || null, "weekly", priority));
  });
  return wrapUrlset(urls);
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const u = new URL(req.url);
    const type = u.searchParams.get("type");
    const ym = u.searchParams.get("ym") || "";
    const part = u.searchParams.get("part");

    let body: string;
    if (!type) body = await buildSitemapIndex(supabase);
    else if (type === "core") body = await buildCore(supabase);
    else if (type === "podcasts") body = await buildPodcasts(supabase);
    else if (type === "episodes") body = await buildEpisodesByMonth(supabase, ym, part);
    else if (type === "entities") body = await buildEntitiesByMonth(supabase, ym);
    else return new Response(`<!-- unknown type: ${type} -->`, { status: 400, headers: xmlHeaders });

    return new Response(body, { headers: xmlHeaders });
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : JSON.stringify(e);
    console.error("sitemap error:", msg);
    return new Response(`<!-- sitemap error: ${msg} -->`, { status: 500, headers: xmlHeaders });
  }
});
