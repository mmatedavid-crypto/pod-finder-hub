// Generates AI bio + episodes_summary + featured episode IDs for a topic_hub.
// Pulls episodes via array overlap (episodes.topics && hub.aliases). Idempotent (30-day stale).
// Body: { slug?: string, all?: boolean, force?: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const STALE_DAYS = 30;
const MODEL = "google/gemini-2.5-flash";

const TOOL = {
  type: "function" as const,
  function: {
    name: "write_topic_hub",
    description: "Write a short factual overview and an episode-coverage summary for the topic.",
    parameters: {
      type: "object",
      properties: {
        bio: {
          type: "string",
          description: "2-4 sentence neutral, encyclopedic overview of the topic in English. What it is, why it matters now. No filler.",
        },
        episodes_summary: {
          type: "string",
          description: "3-5 sentence summary in English describing how the listed podcast episodes cover this topic — recurring angles, tensions, key voices. Speak about the body of coverage, not individual episodes.",
        },
      },
      required: ["bio", "episodes_summary"],
    },
  },
};

async function callAI(messages: any[]) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: MODEL, messages, tools: [TOOL],
      tool_choice: { type: "function", function: { name: "write_topic_hub" } },
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("No tool call");
  const args = JSON.parse(call.function.arguments);
  const it = data?.usage?.prompt_tokens ?? 0;
  const ot = data?.usage?.completion_tokens ?? 0;
  const cost_usd = (it / 1_000_000) * 0.30 + (ot / 1_000_000) * 2.50;
  return { bio: String(args.bio || "").trim(), summary: String(args.episodes_summary || "").trim(), cost_usd };
}

async function processHub(sb: any, hub: any, force: boolean) {
  if (!force && hub.generated_at) {
    const ageDays = (Date.now() - new Date(hub.generated_at).getTime()) / 86400_000;
    if (ageDays < STALE_DAYS) return { slug: hub.slug, skipped: "fresh", ageDays: Math.round(ageDays) };
  }

  // Pull episodes whose topics array overlaps with the hub aliases.
  // overlaps() = `&&` operator on text[].
  const { data: cand, error } = await sb
    .from("episodes")
    .select("id,title,display_title,summary,ai_summary,published_at,topics,podcasts!inner(title,display_title,rss_status,language,podiverzum_rank)")
    .overlaps("topics", hub.aliases)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(800);
  if (error) throw error;

  const visible = (cand || []).filter((e: any) => {
    const ps = e.podcasts;
    if (!ps) return false;
    if (ps.rss_status === "failed" || ps.rss_status === "inactive") return false;
    const lang = (ps.language || "").toLowerCase();
    if (lang && !lang.startsWith("en")) return false;
    return true;
  });

  if (!visible.length) return { slug: hub.slug, skipped: "no_episodes" };

  // Featured = top by rank+freshness (simple composite)
  const scored = visible.map((e: any) => {
    const rank = Number(e.podcasts?.podiverzum_rank || 1);
    const ageDays = e.published_at ? (Date.now() - new Date(e.published_at).getTime()) / 86400_000 : 365;
    const freshness = Math.exp(-ageDays / 60);
    return { e, score: rank * (0.3 + freshness) };
  }).sort((a, b) => b.score - a.score);

  const featured = scored.slice(0, 30).map((x) => x.e);
  const all_ids = scored.slice(0, 300).map((x) => x.e.id);
  const featured_ids = featured.map((e: any) => e.id);

  // AI prompt sample
  const sample = featured.slice(0, 25).map((e: any) => {
    const t = e.display_title || e.title || "";
    const blurb = (e.ai_summary || e.summary || "").trim().replace(/\s+/g, " ").slice(0, 240);
    const pod = (e.podcasts?.display_title || e.podcasts?.title || "").trim();
    return `- [${pod}] ${t}${blurb ? " — " + blurb : ""}`;
  }).join("\n");

  const system = `You write concise, factual topic overviews for a podcast discovery site (Podiverzum). All output in English. No marketing fluff. Neutral, encyclopedic.`;
  const user = `Topic hub: "${hub.title}"
Aliases (these are how the topic shows up in episode metadata): ${hub.aliases.join(", ")}

${visible.length} matched English episodes. Sample (top 25 by quality+freshness):

${sample}

Call write_topic_hub.
- bio: 2-4 neutral sentences explaining what "${hub.title}" is and why it's a live conversation right now.
- episodes_summary: 3-5 sentences describing how podcasts are actually covering this topic — what angles, debates, voices, news beats. Don't list episode titles.`;

  const out = await callAI([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  const stats = { total: visible.length, featured: featured_ids.length };
  await sb.from("topic_hubs").update({
    bio: out.bio || null,
    episodes_summary: out.summary || null,
    episode_ids: all_ids,
    featured_episode_ids: featured_ids,
    appearance_stats: stats,
    model: MODEL,
    cost_usd: out.cost_usd,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", hub.id);

  return { slug: hub.slug, ok: true, episodes: visible.length, featured: featured_ids.length, cost_usd: out.cost_usd };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const force = !!body.force;

    let hubs: any[] = [];
    if (body.slug) {
      const { data } = await sb.from("topic_hubs").select("*").eq("slug", String(body.slug)).maybeSingle();
      if (data) hubs = [data];
    } else if (body.all) {
      const { data } = await sb.from("topic_hubs").select("*").eq("active", true).order("sort_order");
      hubs = data || [];
    } else {
      return new Response(JSON.stringify({ error: "slug or all required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];
    for (const hub of hubs) {
      try {
        results.push(await processHub(sb, hub, force));
      } catch (e: any) {
        results.push({ slug: hub.slug, error: String(e?.message || e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
