// Embeds taste_cards.text_for_embedding with google/gemini-embedding-001 (768d)
// via Lovable AI Gateway. Admin-only invocation (requires a valid JWT with the
// admin role). Idempotent: skips cards that already have an embedding unless
// `force=true` is passed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const EMBED_MODEL = "google/gemini-embedding-001";

type Card = { id: string; text_for_embedding: string | null; title: string; subtitle: string | null };

async function embed(text: string): Promise<number[]> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`embed ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const v = j?.data?.[0]?.embedding;
  if (!Array.isArray(v) || v.length !== 768) throw new Error(`bad embedding shape: ${v?.length}`);
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { force?: boolean; limit?: number } = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const force = body.force === true;
    const limit = Math.max(1, Math.min(200, body.limit ?? 100));

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let q = admin.from("taste_cards").select("id, text_for_embedding, title, subtitle").limit(limit);
    if (!force) q = q.is("card_embedding", null);
    const { data: cards, error } = await q;
    if (error) throw error;

    let done = 0, failed = 0;
    const errors: string[] = [];
    for (const c of (cards ?? []) as Card[]) {
      const text = (c.text_for_embedding && c.text_for_embedding.trim())
        || [c.title, c.subtitle].filter(Boolean).join(" — ");
      if (!text) { failed++; errors.push(`${c.id}: empty text`); continue; }
      try {
        const v = await embed(text);
        const literal = `[${v.join(",")}]`;
        const { error: upErr } = await admin
          .from("taste_cards")
          .update({ card_embedding: literal, validation_status: "embedded" })
          .eq("id", c.id);
        if (upErr) { failed++; errors.push(`${c.id}: ${upErr.message}`); continue; }
        done++;
      } catch (e) {
        failed++;
        errors.push(`${c.id}: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 80)); // gentle pacing
    }

    return new Response(JSON.stringify({ processed: cards?.length ?? 0, done, failed, errors: errors.slice(0, 10) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
