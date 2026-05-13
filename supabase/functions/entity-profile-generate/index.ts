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

    // Resolve the canonical display name. Prefer any previously-saved name; otherwise sample
    // a few episodes that have the entity column populated and look for a slug-matching value.
    let displayName = slug;
    const { data: prevProfile } = await sb
      .from("entity_profiles").select("display_name").eq("kind", kind).eq("slug", slug).maybeSingle();
    if (prevProfile?.display_name) displayName = prevProfile.display_name;

    if (displayName === slug) {
      // Fallback discovery: scan recent episodes to find the canonical casing
      const { data: probe } = await sb
        .from("episodes")
        .select(`id,${col}`)
        .not(col, "eq", "{}")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(5000);
      for (const e of probe || []) {
        const arr: string[] = (e as any)[col] || [];
        const hit = arr.find((v) => matches(kind, v, slug));
        if (hit) { displayName = hit; break; }
      }
    }

    // Pull ALL episodes containing the canonical entity value (array contains).
    const { data: cand, error: candErr } = await sb
      .from("episodes")
      .select(`id,title,display_title,summary,ai_summary,published_at,${col},podcasts!inner(title,display_title,rss_status)`)
      .contains(col, [displayName])
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(1000);
    if (candErr) throw candErr;

    const matched: any[] = [];
    for (const e of cand || []) {
      const ps = (e as any).podcasts;
      if (!ps || ps.rss_status === "failed" || ps.rss_status === "inactive") continue;
      matched.push(e);
    }
    if (!matched.length) {
      return new Response(JSON.stringify({ ok: false, error: "no episodes" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Heuristic role classifier (only meaningful for `person`) -------------------------------
    // Goal: prefer episodes where the entity ACTUALLY SPEAKS (host/guest) over mere mentions.
    function classifyRole(e: any): { role: "host" | "guest" | "mentioned"; score: number } {
      if (kind !== "person") return { role: "mentioned", score: 0 };
      const name = displayName.trim();
      const nameLc = name.toLowerCase();
      const firstLast = name.split(/\s+/);
      const lastName = firstLast.length > 1 ? firstLast[firstLast.length - 1] : name;
      const podTitle = String(e.podcasts?.display_title || e.podcasts?.title || "").toLowerCase();
      const epTitle = String(e.display_title || e.title || "").toLowerCase();
      const blurb = String(e.ai_summary || e.summary || "").toLowerCase();

      // HOST: podcast named after the person → almost always their own show
      if (podTitle.includes(nameLc) || (lastName.length > 3 && podTitle.includes(lastName.toLowerCase()) && podTitle.length < 60)) {
        return { role: "host", score: 0.95 };
      }
      // GUEST patterns in title (cheap regex, English-first)
      const epRx = [
        new RegExp(`\\bwith\\s+${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i"),
        new RegExp(`\\b(ft\\.?|feat\\.?|featuring)\\s+${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i"),
        new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s+(on|talks|joins|interview|in conversation|sits down)\\b`, "i"),
        new RegExp(`\\b(interview|conversation|chat|q&a)\\s+with\\s+${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i"),
      ];
      for (const rx of epRx) if (rx.test(epTitle)) return { role: "guest", score: 0.85 };

      // GUEST patterns in description (only if name appears)
      if (blurb.includes(nameLc)) {
        const blurbRx = [
          /\b(joins (us|the show|me)|our guest (today|this week)|i('m| am)? joined by|sits down with|in conversation with|spoke (with|to)|talked (with|to))\b/i,
          /\b(welcome|welcoming)\s+[^.]{0,40}/i,
        ];
        for (const rx of blurbRx) {
          const m = blurb.match(rx);
          if (m) {
            // Require name to appear within 80 chars of the cue
            const idx = blurb.indexOf(m[0].toLowerCase());
            const window = blurb.slice(Math.max(0, idx - 80), idx + m[0].length + 80);
            if (window.includes(nameLc)) return { role: "guest", score: 0.7 };
          }
        }
      }
      return { role: "mentioned", score: 0 };
    }

    const enriched = matched.map((e) => ({ e, ...classifyRole(e) }));
    const hosts = enriched.filter((x) => x.role === "host");
    const guests = enriched.filter((x) => x.role === "guest");
    const mentions = enriched.filter((x) => x.role === "mentioned");
    const featured = [...hosts, ...guests];

    // ---- AI summary input: prefer speaker episodes, fall back to mentions ------------------------
    const summarySource = featured.length ? featured.slice(0, 25) : mentions.slice(0, 25);
    const sample = summarySource.map(({ e, role }) => {
      const t = e.display_title || e.title || "";
      const blurb = (e.ai_summary || e.summary || "").trim().replace(/\s+/g, " ").slice(0, 280);
      const pod = (e.podcasts?.display_title || e.podcasts?.title || "").trim();
      const tag = role === "host" ? " (host)" : role === "guest" ? " (guest)" : "";
      return `- [${pod}]${tag} ${t}${blurb ? " — " + blurb : ""}`;
    }).join("\n");

    const speakerLine = featured.length
      ? `Of ${matched.length} matched episodes, ${hosts.length} are hosted by ${displayName} and ${guests.length} feature ${displayName} as a guest.`
      : `${matched.length} episodes mention ${displayName}, but none clearly feature them as host or guest.`;

    const system = `You write concise, factual entity profiles for a podcast discovery site (Podiverzum). All output in English. No marketing fluff. Never invent facts: if you don't reliably know who/what the entity is, leave bio empty.`;
    const user = `Entity: "${displayName}"
Type: ${entityHint(kind)}

${speakerLine}

Below is a sample (showing up to 25 episodes; "(host)"/"(guest)" tags marked when ${displayName} actually speaks):

${sample}

Call write_entity_profile.
- bio: 2-4 neutral encyclopedic sentences about ${displayName} (who they are / what they're known for). English. Empty string if you're not sure.
- episodes_summary: 3-5 sentences describing the body of episodes. If host/guest episodes exist, lead with what ${displayName} talks about in their own words; otherwise describe how they're discussed by others. Don't list episode titles.`;

    const out = await callAI([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    // Storage: featured first (host+guest, capped 100), then add mentions to fill out to 300
    const featured_episode_ids = featured.slice(0, 100).map(({ e }) => e.id);
    const orderedMentioned = mentions.slice(0, Math.max(0, 300 - featured_episode_ids.length)).map(({ e }) => e.id);
    const episode_ids = [...featured_episode_ids, ...orderedMentioned];
    const appearance_stats = { host: hosts.length, guest: guests.length, mentioned: mentions.length, total: matched.length };

    const { error: upErr } = await sb.from("entity_profiles").upsert({
      kind, slug, display_name: displayName,
      bio: out.bio || null,
      episodes_summary: out.episodes_summary || null,
      episode_ids,
      featured_episode_ids,
      appearance_stats,
      model: MODEL,
      cost_usd: out.cost_usd,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "kind,slug" });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({
      ok: true, displayName,
      bio_len: out.bio.length, summary_len: out.episodes_summary.length,
      episodes: matched.length, featured: featured_episode_ids.length,
      stats: appearance_stats, cost_usd: out.cost_usd,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("entity-profile-generate", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
