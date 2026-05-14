// x-generate-reply-suggestions
// Generates 2-3 short, native X-style reply suggestions for an admin-reviewed
// watched post. Suggestions are stored as draft rows in x_reply_suggestions
// for the admin to edit/approve/copy/post manually. Never posts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";

const SYSTEM_PROMPT = `You write short, native-feeling X (Twitter) replies on behalf of Podiverzum, a podcast aggregator that collects podcast episodes about / featuring / discussing a person, company or topic across many shows.

DEFAULT TO SKIP. Most posts should be skipped. Only generate variants when the post has a clear substantive topic, opinion, announcement, or question that genuinely connects to what the matched Podiverzum page collects.

SKIP (return { "skip": true, "skip_reason": "..." }) when ANY of:
- Post is a meme, joke, one-liner, emoji, reaction, or vague vibe.
- Post is purely personal (family, health, weather, food, travel pic, "good morning").
- Post is PR/marketing for a product, film, merch, event ticket — unless the matched page directly covers that exact thing.
- Post is inflammatory, political attack, insult, or culture-war bait.
- Post is a retweet/quote with no added substance, or just a link.
- The connection between the post's specific topic and the matched page is generic ("they both involve X person") rather than substantive.
- You cannot quote a specific concrete word, phrase or claim from the post in your reply naturally.

ABSOLUTE RULES (when not skipping)
- Exactly one URL in the reply, and it MUST be the provided Podiverzum URL verbatim.
- The reply MUST quote or paraphrase a SPECIFIC concrete element from the original post (a word, claim, product, person, event mentioned in it). No generic "discussions about X" templates.
- The word "podcast", "podcasts" or "episodes" MUST appear.
- Max two short sentences. Usually one sentence + the link.
- Sound like a human podcast nerd dropping a useful pointer in a thread. Native to X.
- Forbidden: "check this out", "great post", "interesting take", "if you're interested in", "for more on", "dive deeper", "AI-powered", hashtags, overpraise, fake familiarity, claims that the author endorses Podiverzum.
- Do not summarize the matched page. Do not describe Podiverzum. Just point to it as where the podcast conversations on this specific angle live.

OUTPUT
Return strict JSON:
{
  "skip": false,
  "variants": [
    { "label": "short", "text": "..." },
    { "label": "contextual", "text": "..." }
  ]
}
Each variant.text MUST end with the Podiverzum URL on its own line:

  One sentence quoting/anchoring to the post's specific topic, mentioning podcasts/episodes.

  https://podiverzum.com/...

Variant guidance:
- "short": one tight sentence anchored to the post's specific word/topic + link.
- "contextual": one sentence that explicitly ties the post's specific claim or angle to what podcast guests have actually discussed on the matched page + link.

If you cannot meet the "quote something specific" rule naturally, SKIP.`;

type WatchedPost = {
  id: string;
  x_handle: string;
  post_text: string | null;
  matched_person_slug: string | null;
  matched_topic: string | null;
  matched_podiverzum_url: string | null;
  match_reason: string | null;
};

function looksJustALink(text: string, url: string): boolean {
  const stripped = text.replace(url, "").replace(/\s+/g, " ").trim();
  // require at least 3 words besides the URL
  return stripped.split(/\s+/).filter(Boolean).length < 3;
}

function mentionsPodcast(text: string): boolean {
  return /\b(podcast|podcasts|episode|episodes)\b/i.test(text);
}

function countLinks(text: string): number {
  return (text.match(/https?:\/\/\S+/gi) || []).length;
}

function ensureUrlPresent(text: string, url: string): string {
  if (text.includes(url)) return text;
  return text.replace(/\s+$/, "") + "\n\n" + url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const body = await req.json().catch(() => ({}));
    const watchedPostId: string | undefined = body.watched_post_id;
    if (!watchedPostId) {
      return new Response(JSON.stringify({ error: "watched_post_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: post, error: pErr } = await sb
      .from("x_watched_posts")
      .select("id, x_handle, post_text, matched_person_slug, matched_topic, matched_podiverzum_url, match_reason")
      .eq("id", watchedPostId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!post) {
      return new Response(JSON.stringify({ error: "post not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const wp = post as WatchedPost;
    const url = wp.matched_podiverzum_url;
    if (!url) {
      return new Response(JSON.stringify({ error: "post has no matched_podiverzum_url. Set one before generating." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional: load entity profile context if available
    let entityContext = "";
    if (wp.matched_person_slug) {
      const { data: prof } = await sb
        .from("entity_profiles")
        .select("display_name, bio, episodes_summary")
        .eq("kind", "person").eq("slug", wp.matched_person_slug).maybeSingle();
      if (prof) {
        entityContext = `Podiverzum entity: ${prof.display_name}\nBio: ${prof.bio || "—"}\nWhat the podcasts cover: ${prof.episodes_summary || "—"}`;
      }
    }

    const userPrompt = `Original X post by @${wp.x_handle}:
"""
${wp.post_text || "(no text)"}
"""

Matched Podiverzum URL (use exactly this URL, do NOT modify it):
${url}

Match reason: ${wp.match_reason || "—"}

${entityContext ? "Context about the matched page:\n" + entityContext : ""}

Generate the JSON described in the system prompt. If unsure, prefer { "skip": true, "skip_reason": "..." }.`;

    const aiResp = await fetch(LOVABLE_AI, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      throw new Error(`AI gateway ${aiResp.status}: ${t.slice(0, 300)}`);
    }
    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    if (parsed?.skip) {
      await sb.from("x_watched_posts").update({ status: "skipped", match_reason: (wp.match_reason || "") + ` | ai_skip: ${parsed.skip_reason || ""}` }).eq("id", wp.id);
      await sb.from("x_reply_audit_log").insert({
        watched_post_id: wp.id,
        action: "generate_skip",
        actor: "x-generate-reply-suggestions",
        details: { skip_reason: parsed.skip_reason || null },
      });
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: parsed.skip_reason || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawVariants: any[] = Array.isArray(parsed?.variants) ? parsed.variants : [];
    const cleaned: { label: string; text: string }[] = [];
    for (const v of rawVariants) {
      let text = String(v?.text || "").trim();
      if (!text) continue;
      // strip extra whitespace
      text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
      // make sure URL is present exactly once
      const others = text.match(/https?:\/\/\S+/gi) || [];
      // remove any non-matching URLs
      for (const u of others) {
        if (u.replace(/[).,!?]+$/, "") !== url) {
          text = text.split(u).join("");
        }
      }
      text = ensureUrlPresent(text.replace(/\s+$/, ""), url);
      // length cap (X allows 280; keep ~270 to be safe with URL t.co counting)
      if (text.length > 280) continue;
      if (looksJustALink(text, url)) continue;
      if (!mentionsPodcast(text)) continue;
      if (countLinks(text) !== 1) continue;
      cleaned.push({ label: String(v?.label || "variant"), text });
    }

    if (cleaned.length === 0) {
      await sb.from("x_reply_audit_log").insert({
        watched_post_id: wp.id,
        action: "generate_no_valid",
        actor: "x-generate-reply-suggestions",
        details: { raw },
      });
      return new Response(JSON.stringify({ ok: false, error: "AI produced no valid variants. Try again or edit manually.", raw }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Replace any prior draft suggestions for this post (keep posted/approved)
    await sb.from("x_reply_suggestions").delete().eq("watched_post_id", wp.id).eq("status", "draft");

    const inserts = cleaned.map((c) => ({
      watched_post_id: wp.id,
      variant: c.label,
      suggestion_text: c.text,
      podiverzum_url: url,
      status: "draft" as const,
    }));
    const { data: insRows, error: insErr } = await sb.from("x_reply_suggestions").insert(inserts).select("*");
    if (insErr) throw insErr;

    await sb.from("x_watched_posts").update({ status: "suggested" }).eq("id", wp.id);
    await sb.from("x_reply_audit_log").insert({
      watched_post_id: wp.id,
      action: "generate_ok",
      actor: "x-generate-reply-suggestions",
      details: { variants: cleaned.length },
    });

    return new Response(JSON.stringify({ ok: true, variants: insRows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
