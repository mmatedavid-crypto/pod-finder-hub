// Diagnostic: test if X credentials can post + reply.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hasCreds, xPostJson } from "../_shared/x-oauth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("k") !== "diag-x-2026") {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (!hasCreds()) return new Response(JSON.stringify({ error: "no creds" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    const replyTo = url.searchParams.get("reply_to");
    const text = url.searchParams.get("text") || `diag ${Date.now()}`;
    const body: any = { text };
    if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
    const r = await xPostJson("/tweets", body);
    const txt = await r.text();
    return new Response(JSON.stringify({ status: r.status, ok: r.ok, body: txt, attempted: body }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
