// mood-personalize — AI-generated personalized mood collections.
// Cached per (country, hour_bucket, dow). Privacy-friendly: never stores IPs.
//
// Flow:
//   1) Read CF headers → country + local hour (via timezone offset hint).
//   2) Bucket: hour_bucket = floor(hour/4) [0..5], dow = day-of-week [0..6].
//   3) Cache hit → return.
//   4) Cache miss → Gemini generates 2 mood concepts (title, mood, query, accent_hsl).
//   5) For each concept: embed query, call match_episodes_by_embedding RPC for top 12.
//   6) Persist cache (6h TTL) and return.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function dayOfWeek(d: Date): number { return d.getUTCDay(); } // 0=Sun..6=Sat

// Rough country → UTC offset (hours). Defaults to 0.
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

function timeOfDayLabel(hour: number, dow: number): string {
  const isWeekend = dow === 0 || dow === 6;
  if (hour < 5) return isWeekend ? "late weekend night" : "deep night";
  if (hour < 9) return isWeekend ? "weekend morning" : "weekday morning commute";
  if (hour < 12) return isWeekend ? "weekend late morning" : "mid-morning work focus";
  if (hour < 14) return isWeekend ? "weekend lunch" : "weekday lunch break";
  if (hour < 17) return isWeekend ? "weekend afternoon" : "weekday afternoon focus";
  if (hour < 20) return isWeekend ? "weekend early evening" : "evening commute / wind-down";
  if (hour < 23) return isWeekend ? "weekend evening" : "weekday evening relax";
  return "late night";
}

const MOOD_TOOL = {
  type: "function",
  function: {
    name: "personalized_moods",
    description: "Generate 2 personalized podcast mood collections for the visitor's current context. Each must feel natural for the time/place, not generic. Output English.",
    parameters: {
      type: "object",
      properties: {
        moods: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short title, 2-5 words. Title case. Evocative but not corny." },
              mood: { type: "string", description: "One short phrase (3-6 words) describing the listening state, e.g. 'Friday afternoon ramp-down'." },
              description: { type: "string", description: "One sentence, max 90 chars, factual + warm. No emojis." },
              query: { type: "string", description: "A natural-language semantic search query (5-12 words) describing what podcast episodes should fill this mood. Be specific: topics, formats, tone." },
              accent_hsl: { type: "string", description: "HSL components only (no 'hsl()' wrapper), e.g. '210 80% 55%'. Pick a hue that suits the mood." },
            },
            required: ["title", "mood", "description", "query", "accent_hsl"],
            additionalProperties: false,
          },
        },
      },
      required: ["moods"],
      additionalProperties: false,
    },
  },
};

async function generateMoods(country: string, hour: number, dow: number): Promise<{ title: string; mood: string; description: string; query: string; accent_hsl: string }[]> {
  const tod = timeOfDayLabel(hour, dow);
  const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dow];
  const sys = "You curate personalized podcast moods for the Podiverzum homepage. Suggest 2 distinct moods that match the visitor's current local context. Avoid clichés. Avoid news (we have a separate news section). Each mood must feel different from the other (different headspace, different topics).";
  const user = `Visitor context:
- Local day: ${dayName}
- Local hour: ${hour}:00 (${tod})
- Country: ${country}

Suggest 2 personalized podcast moods. Make them feel like Podiverzum *senses* their state. One can lean topic-driven (e.g. "Tech founder stories"), one can lean tone/format-driven (e.g. "Slow conversations under an hour"). Vary across calls — do not always pick the same two.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: user }] }],
    systemInstruction: { parts: [{ text: sys }] },
    tools: [{ functionDeclarations: [{ name: MOOD_TOOL.function.name, description: MOOD_TOOL.function.description, parameters: MOOD_TOOL.function.parameters }] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [MOOD_TOOL.function.name] } },
    generationConfig: { temperature: 0.9, topP: 0.95 },
  };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const call = j?.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;
  const args = call?.args || {};
  const moods = Array.isArray(args.moods) ? args.moods : [];
  if (moods.length < 2) throw new Error("AI returned <2 moods");
  return moods.slice(0, 2);
}

async function embed(q: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text: q }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const v = j?.embedding?.values as number[] | undefined;
  return v && v.length === 768 ? v : null;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Country from CF header (Cloudflare worker injects this) or fallback.
    const country = (req.headers.get("cf-ipcountry") || req.headers.get("x-country") || "XX").toUpperCase().slice(0, 2);
    const now = new Date();
    const hour = localHour(country, now);
    const hour_bucket = Math.floor(hour / 4); // 0..5
    const dow = dayOfWeek(now);

    const url = new URL(req.url);
    const wantSlug = url.searchParams.get("slug"); // for detail-page lookup
    const force = url.searchParams.get("force") === "1";

    // 1) Cache lookup
    let cached: any = null;
    if (!force) {
      const { data } = await admin
        .from("dynamic_mood_cache")
        .select("payload, expires_at")
        .eq("country", country).eq("hour_bucket", hour_bucket).eq("dow", dow)
        .gt("expires_at", now.toISOString())
        .maybeSingle();
      cached = data;
    }

    let payload = cached?.payload as { moods: any[] } | null;

    // 2) Cache miss → generate
    if (!payload) {
      const concepts = await generateMoods(country, hour, dow);
      const moods: any[] = [];
      for (const c of concepts) {
        const emb = await embed(c.query);
        let episode_ids: string[] = [];
        let episodes: any[] = [];
        if (emb) {
          const { data: matches } = await admin.rpc("match_episodes_by_embedding", {
            query_embedding: `[${emb.join(",")}]` as any,
            match_limit: 12,
            max_age_days: 30,
          });
          episodes = (matches || []) as any[];
          episode_ids = episodes.map((m: any) => m.episode_id);
        }
        moods.push({
          slug: `dyn-${slugify(c.title)}`,
          title: c.title,
          mood: c.mood,
          description: c.description,
          accent_hsl: c.accent_hsl,
          query: c.query,
          episode_ids,
          episodes, // include hydrated rows so frontend doesn't need a second roundtrip
          generated_at: now.toISOString(),
        });
      }
      payload = { moods };

      // Persist cache (6h TTL)
      await admin.from("dynamic_mood_cache").upsert({
        country, hour_bucket, dow,
        payload,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 6 * 3600_000).toISOString(),
        hits: 1,
      }, { onConflict: "country,hour_bucket,dow" });
    } else {
      // bump hits (best-effort, don't await)
      admin.from("dynamic_mood_cache")
        .update({ hits: (cached?.hits ?? 0) + 1 } as any)
        .eq("country", country).eq("hour_bucket", hour_bucket).eq("dow", dow)
        .then(() => {}, () => {});
    }

    // If client asked for a specific slug, return only that mood
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
