import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
const CF_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
Deno.serve(async (_req) => {
  const r = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { Authorization: `Bearer ${CF_TOKEN}` },
  });
  const j = await r.json();
  return new Response(JSON.stringify(j, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
