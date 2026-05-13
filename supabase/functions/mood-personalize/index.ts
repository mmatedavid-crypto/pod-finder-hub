// mood-personalize — picks 2 evergreen moods from the AI-curated mood_pool,
// matched to the visitor's local context. Falls back to inline AI generation
// only if the pool is too small (cold-start).
//
// Cache: per (country, hour_bucket, dow), TTL 6h. Privacy: never stores IPs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const COUNTRY_TZ: Record<string, number> = {
  US: -5, CA: -5, MX: -6, BR: -3, AR: -3,
  GB: 0, IE: 0, PT: 0, FR: 1, DE: 1, ES: 1, IT: 1, NL: 1, BE: 1, CH: 1, AT: 1, PL: 1, CZ: 1, SE: 1, DK: 1, NO: 1, HU: 1,
  GR: 2, RO: 2, FI: 2, BG: 2, UA: 2, IL: 2, ZA: 2,
  TR: 3, RU: 3, SA: 3, AE: 4,
  IN: 5, PK: 5, BD: 6, TH: 7, VN: 7, ID: 7, SG: 8, MY: 8, PH: 8, CN: 8, HK: 8, TW: 8,
  JP: 9, KR: 9, AU: 10, NZ: 12,
};
function localHour(country: string, now: Date): number {
  const off = COUNTRY_TZ[country] ?? 0;
  return (now.getUTCHours() + off + 24) % 24;
}
function dayOfWeek(d: Date) { return d.getUTCDay(); }

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// --- Cold-start fallback (kept lean) ---
const FALLBACK_TOOL = {
  name: "personalized_moods",
  parameters: {
    type: "object",
    properties: {
      moods: {
        type: "array", minItems: 2, maxItems: 2,
        items: {
          type: "object",
          properties: {
            title: { type: "string" }, mood: { type: "string" },
            description: { type: "string" }, query: { type: "string" }, accent_hsl: { type: "string" },
          },
          required: ["title","mood","description","query","accent_hsl"],
        },
      },
    },
    required: ["moods"],
  },
};

async function fallbackGenerate(country: string, hour: number, dow: number) {
  const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dow];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const stripAP = (o: any): any => Array.isArray(o) ? o.map(stripAP) : (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== "additionalProperties").map(([k,v]) => [k, stripAP(v)])) : o);
  const body = {
    contents: [{ role: "user", parts: [{ text: `Local: ${dayName} ${hour}:00, country ${country}. Suggest 4 distinct evergreen podcast moods for this moment.` }] }],
    systemInstruction: { parts: [{ text: "Curate 4 podcast moods for the visitor. Distinct, evergreen, no news, no clichés." }] },
    tools: [{ functionDeclarations: [{ name: FALLBACK_TOOL.name, parameters: stripAP(FALLBACK_TOOL.parameters) }] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [FALLBACK_TOOL.name] } },
    generationConfig: { temperature: 0.9 },
  };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const j = await r.json();
  const call = j?.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;
  return (call?.args?.moods || []) as any[];
}

async function embed(q: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "models/gemini-embedding-001", content: { parts: [{ text: q }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 }) });
  if (!r.ok) return null;
  const v = (await r.json())?.embedding?.values as number[] | undefined;
  return v && v.length === 768 ? v : null;
}

async function hydrateEpisodes(admin: any, episode_ids: string[]) {
  if (!episode_ids.length) return [];
  const { data } = await admin
    .from("episodes")
    .select("id,slug,title,display_title,ai_summary,published_at,audio_url,podcasts!inner(slug,title,display_title,image_url,category,rank_label)")
    .in("id", episode_ids);
  const order = new Map(episode_ids.map((id, i) => [id, i]));
  const sorted = (data || []).slice().sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return sorted.map((e: any) => ({
    episode_id: e.id, episode_slug: e.slug, title: e.title, display_title: e.display_title,
    ai_summary: e.ai_summary, published_at: e.published_at, audio_url: e.audio_url,
    podcast_slug: e.podcasts?.slug, podcast_title: e.podcasts?.title, podcast_display_title: e.podcasts?.display_title,
    podcast_image_url: e.podcasts?.image_url, podcast_category: e.podcasts?.category, rank_label: e.podcasts?.rank_label,
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const country = (req.headers.get("cf-ipcountry") || req.headers.get("x-country") || "XX").toUpperCase().slice(0, 2);
    const now = new Date();
    const hour = localHour(country, now);
    const hour_bucket = Math.floor(hour / 4);
    const dow = dayOfWeek(now);
    const url = new URL(req.url);
    const wantSlug = url.searchParams.get("slug");
    const force = url.searchParams.get("force") === "1";

    // Cache
    let cached: any = null;
    if (!force) {
      const { data } = await admin.from("dynamic_mood_cache")
        .select("payload, expires_at")
        .eq("country", country).eq("hour_bucket", hour_bucket).eq("dow", dow)
        .gt("expires_at", now.toISOString()).maybeSingle();
      cached = data;
    }
    let payload = cached?.payload as { moods: any[] } | null;

    if (!payload) {
      // Pick from pool
      const { data: picked } = await admin.rpc("mood_pool_pick", { p_country: country, p_hour: hour, p_dow: dow, p_k: 4 });
      let moods: any[] = [];
      if (picked && picked.length >= 1) {
        for (const p of picked as any[]) {
          // Refresh episodes if older than 24h or missing
          let epIds: string[] = p.episode_ids || [];
          const stale = !p.episodes_refreshed_at || (now.getTime() - new Date(p.episodes_refreshed_at).getTime()) > 24 * 3600_000;
          if ((!epIds.length || stale)) {
            const emb = await embed(p.query);
            if (emb) {
              const { data: m } = await admin.rpc("match_episodes_by_embedding", {
                query_embedding: `[${emb.join(",")}]` as any, match_limit: 12, max_age_days: 30,
              });
              epIds = ((m || []) as any[]).map((x) => x.episode_id);
              if (epIds.length) {
                await admin.from("mood_pool").update({ episode_ids: epIds, episodes_refreshed_at: now.toISOString() }).eq("slug", p.slug);
              }
            }
          }
          const episodes = await hydrateEpisodes(admin, epIds);
          moods.push({
            slug: p.slug, title: p.title, mood: p.mood, description: p.description,
            accent_hsl: p.accent_hsl, query: p.query, episode_ids: epIds, episodes,
            generated_at: now.toISOString(),
          });
          // Bump impression
          admin.rpc("mood_pool_bump_impression", { p_slug: p.slug }).then(() => {}, () => {});
        }
      } else {
        // Cold-start fallback
        console.log("mood pool too small, using fallback gen");
        const concepts = await fallbackGenerate(country, hour, dow);
        for (const c of concepts) {
          const emb = await embed(c.query);
          let epIds: string[] = [];
          if (emb) {
            const { data: m } = await admin.rpc("match_episodes_by_embedding", { query_embedding: `[${emb.join(",")}]` as any, match_limit: 12, max_age_days: 30 });
            epIds = ((m || []) as any[]).map((x) => x.episode_id);
          }
          const episodes = await hydrateEpisodes(admin, epIds);
          moods.push({ slug: `dyn-${slugify(c.title)}`, title: c.title, mood: c.mood, description: c.description, accent_hsl: c.accent_hsl, query: c.query, episode_ids: epIds, episodes, generated_at: now.toISOString() });
        }
        // Trigger background pool refresh (fire-and-forget)
        try {
          const refreshUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mood-pool-refresh`;
          fetch(refreshUrl, { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` } }).catch(() => {});
        } catch { /* noop */ }
      }
      payload = { moods };

      await admin.from("dynamic_mood_cache").upsert({
        country, hour_bucket, dow, payload,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 6 * 3600_000).toISOString(),
        hits: 1,
      }, { onConflict: "country,hour_bucket,dow" });
    }

    if (wantSlug) {
      const found = payload.moods.find((m: any) => m.slug === wantSlug);
      if (!found) return json({ error: "mood not found in current cache" }, 404);
      return json({ mood: found, country, hour, dow });
    }
    return json({ moods: payload.moods, country, hour, dow, cache_hit: !!cached });
  } catch (e: any) {
    console.error("mood-personalize error", e);
    return json({ error: e?.message || "error", moods: [] }, 500);
  }
});
