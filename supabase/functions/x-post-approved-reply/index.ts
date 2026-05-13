// x-post-approved-reply
// Posts an admin-approved reply to X. Admin-only — verifies the caller has the
// admin role via getClaims/has_role, then runs all safety gates before posting.
//
// Input: { suggestion_id: uuid }
//
// Will refuse to post if:
// - caller is not an admin
// - suggestion is not in "approved" status
// - watched post already posted
// - suggestion is just a link
// - suggestion has more than one URL
// - suggestion does not mention podcast/episodes
// - suggestion text matches any of the last 10 posted replies
// - X credentials are not configured

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hasCreds, xPostJson } from "../_shared/x-oauth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function countLinks(text: string): number {
  return (text.match(/https?:\/\/\S+/gi) || []).length;
}
function looksJustALink(text: string, url: string): boolean {
  const stripped = text.replace(url, "").replace(/\s+/g, " ").trim();
  return stripped.split(/\s+/).filter(Boolean).length < 3;
}
function mentionsPodcast(text: string): boolean {
  return /\b(podcast|podcasts|episode|episodes)\b/i.test(text);
}
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.slice("Bearer ".length);
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (isAdmin !== true) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const suggestionId: string | undefined = body.suggestion_id;
    if (!suggestionId) {
      return new Response(JSON.stringify({ error: "suggestion_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sug, error: sErr } = await sb
      .from("x_reply_suggestions")
      .select("id, watched_post_id, suggestion_text, podiverzum_url, status")
      .eq("id", suggestionId).maybeSingle();
    if (sErr) throw sErr;
    if (!sug) return new Response(JSON.stringify({ error: "suggestion not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    if (sug.status !== "approved") {
      return new Response(JSON.stringify({ error: `suggestion status is ${sug.status}, must be approved` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: wp } = await sb
      .from("x_watched_posts")
      .select("id, x_post_id, status")
      .eq("id", sug.watched_post_id).maybeSingle();
    if (!wp) return new Response(JSON.stringify({ error: "watched post not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    if (wp.status === "posted") {
      return new Response(JSON.stringify({ error: "already posted to this watched post" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = sug.suggestion_text || "";
    if (countLinks(text) !== 1) {
      return new Response(JSON.stringify({ error: "reply must contain exactly one URL" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (looksJustALink(text, sug.podiverzum_url)) {
      return new Response(JSON.stringify({ error: "reply is essentially just a link" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!mentionsPodcast(text)) {
      return new Response(JSON.stringify({ error: "reply must mention podcast/episodes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length > 280) {
      return new Response(JSON.stringify({ error: "reply too long for X (>280 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // duplicate check vs last 10 posted replies
    const { data: recent } = await sb
      .from("x_reply_suggestions")
      .select("suggestion_text")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(10);
    const norm = normalize(text);
    if ((recent || []).some((r: any) => normalize(r.suggestion_text || "") === norm)) {
      return new Response(JSON.stringify({ error: "identical to a recent posted reply" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!hasCreds()) {
      return new Response(JSON.stringify({ error: "X credentials not configured. Use Copy reply instead." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Post
    let xReplyId: string | null = null;
    let xErr: string | null = null;
    try {
      const r = await xPostJson("/tweets", {
        text,
        reply: { in_reply_to_tweet_id: wp.x_post_id },
      });
      const txt = await r.text();
      if (!r.ok) throw new Error(`X API ${r.status}: ${txt.slice(0, 300)}`);
      const j = JSON.parse(txt);
      xReplyId = j?.data?.id || null;
    } catch (e: any) {
      xErr = String(e?.message || e);
    }

    if (xErr) {
      await sb.from("x_reply_suggestions").update({ error_message: xErr }).eq("id", sug.id);
      await sb.from("x_reply_audit_log").insert({
        watched_post_id: wp.id, suggestion_id: sug.id,
        action: "post_failed", actor: userId, details: { error: xErr },
      });
      return new Response(JSON.stringify({ ok: false, error: xErr }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    await sb.from("x_reply_suggestions").update({
      status: "posted", posted_at: now, x_reply_id: xReplyId, error_message: null,
    }).eq("id", sug.id);
    await sb.from("x_watched_posts").update({ status: "posted" }).eq("id", wp.id);
    await sb.from("x_reply_audit_log").insert({
      watched_post_id: wp.id, suggestion_id: sug.id,
      action: "post_ok", actor: userId,
      details: { x_reply_id: xReplyId },
    });

    return new Response(JSON.stringify({
      ok: true,
      x_reply_id: xReplyId,
      x_reply_url: xReplyId ? `https://x.com/i/web/status/${xReplyId}` : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
