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
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace(/^Bearer /, "");
    const { data: claims } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return new Response(JSON.stringify({ error: "unauth" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "admin only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    if (!hasCreds()) return new Response(JSON.stringify({ error: "no creds" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    const url = new URL(req.url);
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
