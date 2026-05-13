// Generates a short bio + episode-coverage summary for an entity (person/company/ticker/topic)
// and caches it in entity_profiles. Idempotent; refresh allowed via { force:true }.
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

const ENTITY_COLUMN: Record<string, string> = {
  person: "people", company: "companies", ticker: "tickers", topic: "topics", ingredient: "ingredients",
};

function matches(kind: string, value: string, slug: string): boolean {
  if (!value) return false;
  if (kind === "ticker") return value.replace(/[^a-zA-Z0-9.]+/g, "").toUpperCase() === slug.toUpperCase();
  const s = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return s === slug.toLowerCase();
}

function entityHint(kind: string): string {
  switch (kind) {
    case "person": return "a public person (commonly an author, scientist, founder, athlete, artist, politician etc.)";
    case "company": return "a company or organization";
    case "ticker": return "a publicly-traded company (stock ticker)";
    case "topic": return "a topic or theme";
    case "ingredient": return "a food ingredient or compound";
    default: return "an entity";
  }
}

const TOOL = {
  type: "function" as const,
  function: {
    name: "write_entity_profile",
    description: "Write a short factual bio and an episode-coverage summary for the entity.",
    parameters: {
      type: "object",
      properties: {
        bio: {
          type: "string",
          description: "2-4 sentence factual bio of the entity in English. Neutral, encyclopedic tone. No filler. If you genuinely don't know who this is, return an empty string.",
        },
        episodes_summary: {
          type: "string",
          description: "3-5 sentence summary in English describing what the listed podcast episodes actually cover about this entity (themes, recurring topics, angles). Speak about the episodes as a body of coverage, not individually.",
        },
      },
      required: ["bio", "episodes_summary"],
    },
  },
};

async function callAI(messages: any[]): Promise<{ bio: string; episodes_summary: string; cost_usd: number }> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "write_entity_profile" } },
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("No tool call returned");
  const args = JSON.parse(call.function.arguments);
  const it = data?.usage?.prompt_tokens ?? 0;
  const ot = data?.usage?.completion_tokens ?? 0;
  // Gemini 2.5 Flash: ~$0.30/1M in, $2.50/1M out
  const cost_usd = (it / 1_000_000) * 0.30 + (ot / 1_000_000) * 2.50;
  return { bio: String(args.bio || "").trim(), episodes_summary: String(args.episodes_summary || "").trim(), cost_usd };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || "");
    const slug = String(body.slug || "").trim();
    const force = !!body.force;
    if (!ENTITY_COLUMN[kind] || !slug) {
      return new Response(JSON.stringify({ error: "kind+slug required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Skip if fresh
    if (!force) {
      const { data: existing } = await sb.from("entity_profiles").select("updated_at").eq("kind", kind).eq("slug", slug).maybeSingle();
      if (existing?.updated_at) {
        const ageDays = (Date.now() - new Date(existing.updated_at).getTime()) / 86400_000;
        if (ageDays < STALE_DAYS) {
          return new Response(JSON.stringify({ ok: true, skipped: "fresh", ageDays }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    const col = ENTITY_COLUMN[kind];
    const { data: cand, error: candErr } = await sb
      .from("episodes")
      .select(`id,title,display_title,summary,ai_summary,published_at,${col},podcasts!inner(title,display_title,rss_status)`)
      .not(col, "eq", "{}")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(2000);
    if (candErr) throw candErr;

    let displayName = slug;
    const matched: any[] = [];
    for (const e of cand || []) {
      const arr: string[] = (e as any)[col] || [];
      const hit = arr.find((v) => matches(kind, v, slug));
      if (!hit) continue;
      const ps = (e as any).podcasts;
      if (!ps || ps.rss_status === "failed" || ps.rss_status === "inactive") continue;
      matched.push(e);
      if (displayName === slug) displayName = hit;
    }
    if (!matched.length) {
      return new Response(JSON.stringify({ ok: false, error: "no episodes" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build compact context: top 25 newest episodes, short blurbs
    const sample = matched.slice(0, 25).map((e) => {
      const t = e.display_title || e.title || "";
      const blurb = (e.ai_summary || e.summary || "").trim().replace(/\s+/g, " ").slice(0, 280);
      const pod = (e.podcasts?.display_title || e.podcasts?.title || "").trim();
      return `- [${pod}] ${t}${blurb ? " — " + blurb : ""}`;
    }).join("\n");

    const system = `You write concise, factual entity profiles for a podcast discovery site (Podiverzum). All output in English. No marketing fluff. Never invent facts: if you don't reliably know who/what the entity is, leave bio empty.`;
    const user = `Entity: "${displayName}"
Type: ${entityHint(kind)}

Below are ${matched.length} podcast episodes from the index that mention this entity (showing up to 25 newest):

${sample}

Call write_entity_profile.
- bio: 2-4 neutral encyclopedic sentences about ${displayName} (who they are / what it is, what they're known for). English. Empty string if you're not sure.
- episodes_summary: 3-5 sentences describing what the body of episodes above actually cover about ${displayName} — themes, recurring topics, common angles. Don't list episode titles.`;

    const out = await callAI([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    const episode_ids = matched.slice(0, 100).map((e: any) => e.id);
    const { error: upErr } = await sb.from("entity_profiles").upsert({
      kind, slug, display_name: displayName,
      bio: out.bio || null,
      episodes_summary: out.episodes_summary || null,
      episode_ids,
      model: MODEL,
      cost_usd: out.cost_usd,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "kind,slug" });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true, displayName, bio_len: out.bio.length, summary_len: out.episodes_summary.length, episodes: matched.length, cost_usd: out.cost_usd }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("entity-profile-generate", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
