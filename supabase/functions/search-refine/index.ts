// search-refine: decides whether the search bar should "wake up" with chips
// (Neo silent badge) or a closest-match panel for zero-hit queries.
// Chips are aggregated from the REAL top-50 results so every chip click is
// guaranteed to lead to actual matches — no dead ends.
//
// POST { q, topResults: ChipResult[], strictHitCount?: number, totalHits?: number, intent?: string }
// -> { mode: "off"|"ambiguity"|"zero_hit", message: string, chips: Chip[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { aggregateChips, decideMode, type Chip, type ChipResult } from "../_shared/neo-chips.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

type Out = { mode: "off" | "ambiguity" | "zero_hit"; message: string; chips: Chip[] };
const OFF: Out = { mode: "off", message: "", chips: [] };

function normalizeQ(q: string): string {
  return q.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
}

async function genMessage(
  mode: "ambiguity" | "zero_hit",
  q: string,
  chips: Chip[],
  topTitles: string[],
): Promise<string> {
  if (!LOVABLE_API_KEY) {
    return mode === "zero_hit"
      ? `no exact hit for "${q}". closest match below.`
      : `"${q}" spans a few angles — pick one.`;
  }
  const sys = mode === "zero_hit"
    ? "You are Neo in a green terminal. Zero exact hits for the query. State that succinctly and tease the closest topic. ONE sentence, lowercase, max 90 chars, no greetings, no emojis. End with '.'."
    : "You are Neo in a green terminal. The query is ambiguous across multiple meanings. State the ambiguity in ONE clause referencing the chip choices. lowercase, max 80 chars, no greetings, no emojis, no questions. End with '.'.";
  const userTurn = `query: "${q}"\nchips: ${chips.map((c) => c.label).join(", ") || "(none)"}\ntop titles: ${topTitles.slice(0, 3).join(" | ")}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: userTurn }],
        temperature: 0.3,
      }),
    });
    clearTimeout(timer);
    if (!r.ok) return mode === "zero_hit" ? `no exact hit. closest match below.` : `"${q}" spans a few angles.`;
    const j = await r.json();
    const txt = String(j?.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "").slice(0, 120);
    return txt || (mode === "zero_hit" ? `no exact hit. closest match below.` : `"${q}" spans a few angles.`);
  } catch {
    clearTimeout(timer);
    return mode === "zero_hit" ? `no exact hit. closest match below.` : `"${q}" spans a few angles.`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const q = String(body.q || "").trim();
    const topResults: ChipResult[] = Array.isArray(body.topResults) ? body.topResults.slice(0, 50) : [];
    const totalHits = Number.isFinite(body.totalHits) ? Number(body.totalHits) : topResults.length;
    const strictHitCount = Number.isFinite(body.strictHitCount) ? Number(body.strictHitCount) : topResults.length;
    const intent = typeof body.intent === "string" ? body.intent : undefined;

    if (!q) return new Response(JSON.stringify(OFF), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const mode = decideMode({ q, totalHits, strictHitCount, topResults, intent });
    if (mode === "off") {
      return new Response(JSON.stringify(OFF), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cache lookup
    const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const qNorm = normalizeQ(q);
    try {
      const { data: cached } = await supa
        .from("search_query_cache")
        .select("refine, updated_at")
        .eq("q_norm", qNorm)
        .maybeSingle();
      if (cached?.refine && cached.updated_at && Date.now() - new Date(cached.updated_at).getTime() < CACHE_TTL_MS) {
        const c = cached.refine as Out;
        if (c?.mode && Array.isArray(c?.chips)) {
          return new Response(JSON.stringify(c), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    } catch (e) { console.warn("cache read", e); }

    const chips = aggregateChips(topResults, q, { maxChips: 3, minCount: mode === "zero_hit" ? 2 : 3 });
    if (chips.length === 0) {
      // No verified disambiguation possible → don't surface Neo at all.
      return new Response(JSON.stringify(OFF), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const topTitles: string[] = (Array.isArray(body.topTitles) ? body.topTitles : []).slice(0, 3);
    const message = await genMessage(mode, q, chips, topTitles);
    const out: Out = { mode, message, chips };

    supa.from("search_query_cache").upsert({
      q_norm: qNorm,
      refine: out,
      updated_at: new Date().toISOString(),
    }, { onConflict: "q_norm" }).then(() => {}, (e) => console.warn("cache write", e));

    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("search-refine err", e);
    return new Response(JSON.stringify(OFF), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
