// search-refine: decides whether the search bar should "wake up" and ask the
// user a clarifying question (Matrix-style "Neo moment"). One short question only.
// POST { q: string, topResults: [{title, podcast, summary}] }
// -> { should_clarify: boolean, question: string, suggestions: string[] }
// Cached in search_query_cache.refine (jsonb), keyed by q_norm.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const CACHE_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

function normalizeQ(q: string): string {
  return q.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function shouldEvenAsk(q: string, results: Array<{ podcast?: string }>): boolean {
  // Heuristic gate before paying for the LLM call:
  // - Need at least 6 results to have ambiguity
  // - Skip very long queries (user already specific)
  if (results.length < 6) return false;
  const wordCount = q.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 5) return false;
  // Diversity check — at least 2 distinct podcasts in top 6
  const distinctPodcasts = new Set(results.slice(0, 6).map((r) => (r.podcast || "").toLowerCase()).filter(Boolean));
  if (distinctPodcasts.size < 2) return false;
  return true;
}

type RefineResult = {
  should_clarify: boolean;
  question: string;
  suggestions: string[];
};

const EMPTY_RESULT: RefineResult = { should_clarify: false, question: "", suggestions: [] };

async function callRefineAI(q: string, results: Array<{ title: string; podcast: string; summary: string }>): Promise<RefineResult> {
  if (!LOVABLE_API_KEY) return EMPTY_RESULT;
  const compact = results.slice(0, 6).map((r, i) => ({
    i: i + 1,
    title: String(r.title || "").slice(0, 120),
    podcast: String(r.podcast || "").slice(0, 60),
    summary: String(r.summary || "").slice(0, 200),
  }));

  const sys = [
    "You are a podcast search assistant deciding whether a user's query is ambiguous enough to warrant ONE short clarifying question.",
    "Style: terse, like a 1990s terminal. No greetings, no fluff, no emojis. Always end with a question mark.",
    "Only ask if the top results clearly span 2+ distinct meanings (e.g. a film vs. a person, a band vs. a sports team, a product vs. a city).",
    "If the results are coherent or the query is already specific, set should_clarify=false and leave question empty.",
    "Question MUST be max 90 characters, English, single sentence.",
    "Provide 2-3 short suggestion strings the user could type back (max 20 chars each).",
  ].join(" ");

  const user = `Query: "${q}"\n\nTop results:\n${compact.map((c) => `[${c.i}] "${c.title}" — ${c.podcast}\n  ${c.summary}`).join("\n")}\n\nDecide.`;

  const tools = [{
    type: "function",
    function: {
      name: "decide_clarification",
      description: "Decide whether to ask the user a clarifying question.",
      parameters: {
        type: "object",
        properties: {
          should_clarify: { type: "boolean", description: "True only if the query is genuinely ambiguous between 2+ meanings." },
          question: { type: "string", description: "The clarifying question, max 90 chars. Empty if should_clarify is false." },
          suggestions: {
            type: "array",
            items: { type: "string" },
            description: "2-3 short refinement strings the user could type as answer. Empty if should_clarify is false.",
          },
        },
        required: ["should_clarify", "question", "suggestions"],
        additionalProperties: false,
      },
    },
  }];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        tools,
        tool_choice: { type: "function", function: { name: "decide_clarification" } },
        temperature: 0.2,
      }),
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.warn("refine ai", resp.status);
      return EMPTY_RESULT;
    }
    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) return EMPTY_RESULT;
    let parsed: any;
    try { parsed = JSON.parse(call.function.arguments); } catch { return EMPTY_RESULT; }
    if (!parsed.should_clarify) return EMPTY_RESULT;
    const question = String(parsed.question || "").trim().slice(0, 120);
    if (!question) return EMPTY_RESULT;
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map((s: unknown) => String(s || "").trim().slice(0, 30)).filter(Boolean).slice(0, 3)
      : [];
    return { should_clarify: true, question, suggestions };
  } catch (e) {
    clearTimeout(timer);
    console.warn("refine err", e);
    return EMPTY_RESULT;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const q = String(body.q || "").trim();
    const results = Array.isArray(body.topResults) ? body.topResults : [];
    if (!q) {
      return new Response(JSON.stringify(EMPTY_RESULT), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!shouldEvenAsk(q, results)) {
      return new Response(JSON.stringify(EMPTY_RESULT), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const qNorm = normalizeQ(q);

    // Cache lookup
    try {
      const { data: cached } = await supa
        .from("search_query_cache")
        .select("refine, updated_at")
        .eq("q_norm", qNorm)
        .maybeSingle();
      if (cached?.refine && cached.updated_at && Date.now() - new Date(cached.updated_at).getTime() < CACHE_TTL_MS) {
        return new Response(JSON.stringify(cached.refine), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } catch (e) { console.warn("cache read", e); }

    const refined = await callRefineAI(q, results);

    // Persist (upsert; create row if missing, otherwise patch the refine column)
    supa.from("search_query_cache").upsert({
      q_norm: qNorm,
      refine: refined,
      updated_at: new Date().toISOString(),
    }, { onConflict: "q_norm" }).then(() => {}, (e) => console.warn("cache write", e));

    return new Response(JSON.stringify(refined), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("search-refine err", e);
    return new Response(JSON.stringify(EMPTY_RESULT), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
