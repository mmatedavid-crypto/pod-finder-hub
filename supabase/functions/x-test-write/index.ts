// Diagnostic: test if X credentials can post + reply.
// GET /x-test-write?reply_to=<tweet_id>  -> attempts to post a test reply
// GET /x-test-write                       -> attempts to post a standalone test tweet
// Service-role only.
import { hasCreds, xPostJson } from "../_shared/x-oauth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const apikey = req.headers.get("apikey") || "";
  const auth = req.headers.get("Authorization") || "";
  const sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (apikey !== sk && auth !== `Bearer ${sk}`) {
    return new Response(JSON.stringify({ error: "service-role only" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }
  if (!hasCreds()) {
    return new Response(JSON.stringify({ error: "no creds" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const url = new URL(req.url);
  const replyTo = url.searchParams.get("reply_to");
  const text = `diag ${Date.now()}`;
  const body: any = { text };
  if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
  const r = await xPostJson("/tweets", body);
  const txt = await r.text();
  return new Response(JSON.stringify({ status: r.status, ok: r.ok, body: txt }), {
    status: 200, headers: { ...cors, "Content-Type": "application/json" },
  });
});
