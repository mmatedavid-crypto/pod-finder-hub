// Tiny edge function that returns the visitor's 2-letter country code
// based on Cloudflare / Supabase edge headers. No IP is stored or returned.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const h = req.headers;
  const country =
    h.get("cf-ipcountry") ||
    h.get("x-vercel-ip-country") ||
    h.get("x-country-code") ||
    null;
  return new Response(
    JSON.stringify({ country: country && country !== "XX" ? country.toUpperCase() : null }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
});
