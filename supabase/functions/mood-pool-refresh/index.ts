// mood-pool-refresh — weekly AI batch that grows the evergreen mood pool
// based on real search trends. Generates 5-10 new concepts, embeds + hydrates,
// then retires overflow to keep the pool capped at MAX_POOL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const MAX_POOL = 20;

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

const TIME_TAGS = ["any","morning","mid-morning","lunch","afternoon","evening","night","late-night","weekend","weekday","focus","wind-down","commute","background"];

const POOL_TOOL = {
  name: "evergreen_moods",
  description: "Generate evergreen podcast mood concepts for the Podiverzum mood pool.",
  parameters: {
    type: "object",
    properties: {
      moods: {
        type: "array",
        minItems: 5,
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short evocative title, 2-5 words, Title Case." },
            mood: { type: "string", description: "Short phrase (3-6 words) for the listening state." },
            description: { type: "string", description: "One sentence ≤90 chars, factual + warm. No emojis." },
            query: { type: "string", description: "Natural-language semantic query (5-12 words) describing the episodes that fit." },
            accent_hsl: { type: "string", description: "HSL components only e.g. '210 80% 55%'." },
            time_tags: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: { type: "string", enum: TIME_TAGS },
              description: "Contexts when this mood fits. Use 'any' for fully evergreen.",
            },
          },
          required: ["title","mood","description","query","accent_hsl","time_tags"],
        },
      },
    },
    required: ["moods"],
  },
};

async function generate(topQueries: string[], existingTitles: string[]) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
  const sys = "You curate the Podiverzum evergreen mood pool. Propose 5-10 NEW mood concepts that are durable (not tied to a single news cycle). Lean on signals from real visitor searches. Avoid duplicating any existing pool title. Each mood must feel distinct (different headspace OR topic OR format). No news, no politics-of-the-day, no holiday-specific moods.";
  const user = `Recent top visitor searches (highest signal first):\n${topQueries.slice(0, 60).map((q, i) => `${i+1}. ${q}`).join("\n")}\n\nExisting active pool titles (do NOT repeat or near-duplicate):\n${existingTitles.map(t => `- ${t}`).join("\n") || "(empty pool)"}\n\nPropose 5-10 evergreen mood concepts. Mix: some topic-driven, some tone/format-driven. Use time_tags to mark when they fit best.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const stripAP = (o: any): any => Array.isArray(o) ? o.map(stripAP) : (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== "additionalProperties").map(([k,v]) => [k, stripAP(v)])) : o);
  const body = {
    contents: [{ role: "user", parts: [{ text: user }] }],
    systemInstruction: { parts: [{ text: sys }] },
    tools: [{ functionDeclarations: [{ name: POOL_TOOL.name, description: POOL_TOOL.description, parameters: stripAP(POOL_TOOL.parameters) }] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [POOL_TOOL.name] } },
    generationConfig: { temperature: 0.95, topP: 0.95 },
  };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const call = j?.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;
  const moods = (call?.args?.moods || []) as any[];
  if (moods.length < 3) throw new Error(`AI returned only ${moods.length} moods`);
  return moods;
}

async function embed(q: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "models/gemini-embedding-001", content: { parts: [{ text: q }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const v = j?.embedding?.values as number[] | undefined;
  return v && v.length === 768 ? v : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1) Top searches last 7d (with results)
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: ev } = await admin
      .from("search_events")
      .select("query")
      .gt("created_at", since)
      .gt("result_count", 0)
      .limit(2000);
    const counts = new Map<string, number>();
    for (const e of (ev || [])) {
      const q = (e.query || "").toString().trim().toLowerCase();
      if (q.length < 3) continue;
      counts.set(q, (counts.get(q) || 0) + 1);
    }
    const topQueries = [...counts.entries()].sort((a,b) => b[1]-a[1]).map(([q]) => q).slice(0, 100);

    // 2) Existing active titles (avoid dupes)
    const { data: existing } = await admin
      .from("mood_pool")
      .select("slug,title")
      .eq("status", "active");
    const existingSlugs = new Set((existing || []).map((r: any) => r.slug));
    const existingTitles = (existing || []).map((r: any) => r.title);

    // 3) Generate
    const concepts = await generate(topQueries, existingTitles);

    // 4) Embed + hydrate + insert
    const inserted: string[] = [];
    const skipped: string[] = [];
    for (const c of concepts) {
      const slug = `dyn-${slugify(c.title)}`;
      if (existingSlugs.has(slug)) { skipped.push(slug); continue; }
      const emb = await embed(c.query);
      let episode_ids: string[] = [];
      if (emb) {
        const { data: matches } = await admin.rpc("match_episodes_by_embedding", {
          query_embedding: `[${emb.join(",")}]` as any,
          match_limit: 12,
          max_age_days: 30,
        });
        episode_ids = ((matches || []) as any[]).map((m) => m.episode_id);
      }
      const tags = Array.isArray(c.time_tags) && c.time_tags.length ? c.time_tags.filter((t: string) => TIME_TAGS.includes(t)) : ["any"];
      const { error } = await admin.from("mood_pool").insert({
        slug, title: c.title, mood: c.mood, description: c.description,
        query: c.query, accent_hsl: c.accent_hsl,
        embedding: emb ? `[${emb.join(",")}]` : null,
        episode_ids, episodes_refreshed_at: new Date().toISOString(),
        time_tags: tags.length ? tags : ["any"],
      } as any);
      if (error) { console.warn("insert err", slug, error.message); skipped.push(slug); }
      else inserted.push(slug);
    }

    // 5) Retire overflow
    const { data: retired } = await admin.rpc("mood_pool_retire_overflow", { p_keep: MAX_POOL });

    return json({ ok: true, top_queries: topQueries.length, generated: concepts.length, inserted, skipped, retired });
  } catch (e: any) {
    console.error("mood-pool-refresh error", e);
    return json({ ok: false, error: e?.message || "error" }, 500);
  }
});
