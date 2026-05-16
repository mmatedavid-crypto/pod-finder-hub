// Deploys infra/cloudflare-worker/worker.js to Cloudflare via REST API.
// worker.js content embedded as base64 at build time.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const WORKER_SRC_B64 = "LyoqCiAqIFBvZGl2ZXJ6dW0gYm90IHByZXJlbmRlciBXb3JrZXIKICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCiAqIC0gRGV0ZWN0cyBBSS9TRU8gY3Jhd2xlciBVc2VyLUFnZW50cwogKiAtIEZvciBtYXRjaGVkIHJvdXRlczogc2VydmVzIHByZXJlbmRlcmVkIEhUTUwgZnJvbSBTdXBhYmFzZSBlZGdlIGZuCiAqICAgKGNhY2hlZCAyNGggdmlhIENhY2hlIEFQSSkKICogLSBFdmVyeXRoaW5nIGVsc2U6IHBhc3N0aHJvdWdoIHRvIExvdmFibGUgb3JpZ2luCiAqCiAqIEJpbmQgdGhpcyBXb3JrZXIgdG86ICBwb2RpdmVyenVtLmNvbS8qICBhbmQgIHd3dy5wb2RpdmVyenVtLmNvbS8qCiAqCiAqIE5vIGVudmlyb25tZW50IHZhcmlhYmxlcyByZXF1aXJlZCDigJQgb3JpZ2luIGFuZCBwcmVyZW5kZXIgVVJMIGFyZSBjb25zdGFudHMuCiAqLwoKY29uc3QgUFJFUkVOREVSX0VORFBPSU5UID0KICAiaHR0cHM6Ly9pcXprYXlvcXFhZ293dnhlYXBoZS5zdXBhYmFzZS5jby9mdW5jdGlvbnMvdjEvcHJlcmVuZGVyIjsKY29uc3QgU0lURU1BUF9FTkRQT0lOVCA9CiAgImh0dHBzOi8vaXF6a2F5b3FxYWdvd3Z4ZWFwaGUuc3VwYWJhc2UuY28vZnVuY3Rpb25zL3YxL3NpdGVtYXAiOwoKLy8gTG92YWJsZSBvcmlnaW4gaG9zdCAocHJveGllZCB2aWEgQ2xvdWRmbGFyZSkuIFdvcmtlcnMgcm91dGUgcnVucyBCRUZPUkUKLy8gdGhlIHByb3h5IHJldHVybnMsIHNvIHdlIGp1c3QgYGZldGNoKHJlcXVlc3QpYCB0byBwYXNzdGhyb3VnaC4KLy8KLy8gQm90IFVBIGRldGVjdGlvbiDigJQgbXVzdCBiZSBsb3dlcmNhc2VkIGJlZm9yZSBtYXRjaGluZy4KY29uc3QgQk9UX1VBUyA9IFsKICAvLyBBSSBjcmF3bGVycyAodGhpcyBpcyB0aGUgbWFpbiByZWFzb24gd2UncmUgZG9pbmcgdGhpcykKICAiZ3B0Ym90IiwKICAib2FpLXNlYXJjaGJvdCIsCiAgImNoYXRncHQtdXNlciIsCiAgImNsYXVkZS13ZWIiLAogICJjbGF1ZGVib3QiLAogICJjbGF1ZGUtdXNlciIsCiAgImNsYXVkZS1zZWFyY2hib3QiLAogICJhbnRocm9waWMtYWkiLAogICJwZXJwbGV4aXR5Ym90IiwKICAicGVycGxleGl0eS11c2VyIiwKICAiZ29vZ2xlLWV4dGVuZGVkIiwKICAieW91Ym90IiwKICAiY2Nib3QiLCAvLyBDb21tb24gQ3Jhd2wsIHVzZWQgYXMgdHJhaW5pbmcgZGF0YQogICJjb2hlcmUtYWkiLAogICJkaWZmYm90IiwKICAiYnl0ZXNwaWRlciIsCiAgImFtYXpvbmJvdCIsCiAgImFwcGxlYm90LWV4dGVuZGVkIiwKICAvLyBDbGFzc2ljIFNFTyArIHNvY2lhbCBwcmV2aWV3cyAoaGVscHMgd2hlbiBKUyBpc24ndCBleGVjdXRlZCkKICAiZ29vZ2xlYm90IiwKICAiYmluZ2JvdCIsCiAgImR1Y2tkdWNrYm90IiwKICAieWFuZGV4Ym90IiwKICAiYmFpZHVzcGlkZXIiLAogICJmYWNlYm9va2V4dGVybmFsaGl0IiwKICAiZmFjZWJvb2tib3QiLAogICJ0d2l0dGVyYm90IiwKICAibGlua2VkaW5ib3QiLAogICJzbGFja2JvdCIsCiAgImRpc2NvcmRib3QiLAogICJ0ZWxlZ3JhbWJvdCIsCiAgIndoYXRzYXBwIiwKICAiZW1iZWRseSIsCiAgInBpbnRlcmVzdCIsCiAgInJlZGRpdGJvdCIsCl07CgpmdW5jdGlvbiBpc0JvdCh1YSkgewogIGlmICghdWEpIHJldHVybiBmYWxzZTsKICBjb25zdCBzID0gdWEudG9Mb3dlckNhc2UoKTsKICByZXR1cm4gQk9UX1VBUy5zb21lKChiKSA9PiBzLmluY2x1ZGVzKGIpKTsKfQoKLy8gUm91dGVzIHdlIGtub3cgaG93IHRvIHByZXJlbmRlci4gQW55dGhpbmcgZWxzZSBmYWxscyBiYWNrIHRvIG9yaWdpbi4KZnVuY3Rpb24gc2hvdWxkUHJlcmVuZGVyKHBhdGhuYW1lKSB7CiAgaWYgKHBhdGhuYW1lID09PSAiLyIgfHwgcGF0aG5hbWUgPT09ICIiKSByZXR1cm4gdHJ1ZTsKICAvLyAvcG9kY2FzdC86c2x1ZyAgb3IgIC9wb2RjYXN0LzpzbHVnLzplcGlzb2RlCiAgaWYgKC9eXC9wb2RjYXN0XC9bXi9dKyhcL1teL10rKT9cLz8kLy50ZXN0KHBhdGhuYW1lKSkgcmV0dXJuIHRydWU7CiAgaWYgKC9eXC9jYXRlZ29yeVwvW14vXStcLz8kLy50ZXN0KHBhdGhuYW1lKSkgcmV0dXJuIHRydWU7CiAgaWYgKC9eXC8odG9waWN8cGVyc29ufGNvbXBhbnl8dGlja2VyfGluZ3JlZGllbnQpXC9bXi9dK1wvPyQvLnRlc3QocGF0aG5hbWUpKSByZXR1cm4gdHJ1ZTsKICByZXR1cm4gZmFsc2U7Cn0KCi8vIEhhcmQtNDA0IHRoZXNlIHNjYW5uZXIgcGF0aHMgcmVnYXJkbGVzcyBvZiBVQS4gQ29uc2VydmF0aXZlIOKAlCBubyBhcHAgcm91dGVzIG1hdGNoLgpjb25zdCBTQ0FOTkVSX1BBVEhfUkVHRVggPQogIC9eXC8od3AtYWRtaW58d3AtbG9naW58d3AtY29udGVudHx3cC1pbmNsdWRlc3x3cC1qc29ufHhtbHJwY1wucGhwfFwuZW52fFwuZ2l0fFwuYXdzfFwuc3NofFwuZG9ja2VyfFwudnNjb2RlfFwuaWRlYXxwaHBteWFkbWlufHBtYXxteXNxbHxhZG1pbmVyfGNvbmZpZ1wucGhwfGNvbmZpZ3VyYXRpb25cLnBocHxiYWNrdXB8YmFja3Vwc3xkdW1wfGR1bXBzfFwuYmFrfFwuc3FsfFwuemlwfFwudGFyfFwudGd6fGNnaS1iaW58Y2dpfG93YXxhdXRvZGlzY292ZXJ8ZWNwfGV4Y2hhbmdlfGJvYWZvcm18SE5BUDF8aHVkc29ufGplbmtpbnN8c29scnxqbXgtY29uc29sZXxtYW5hZ2VyXC9odG1sfGFjdHVhdG9yfGNvbnNvbGV8dGVsZXNjb3BlfGRlYnVnfHNlcnZlci1zdGF0dXN8c2VydmVyLWluZm98YXBpXC9sb2dpbnxhcGlcL3YxXC9sb2dpbikoXC98JHxcLikvaTsKCmV4cG9ydCBkZWZhdWx0IHsKICBhc3luYyBmZXRjaChyZXF1ZXN0LCBlbnYsIGN0eCkgewogICAgY29uc3QgdXJsID0gbmV3IFVSTChyZXF1ZXN0LnVybCk7CiAgICBjb25zdCB1YSA9IHJlcXVlc3QuaGVhZGVycy5nZXQoInVzZXItYWdlbnQiKSB8fCAiIjsKCiAgICAvLyBDYW5vbmljYWwgaG9zdCBlbmZvcmNlbWVudDogd3d3LnBvZGl2ZXJ6dW0uY29tIOKGkiBwb2RpdmVyenVtLmNvbSAoMzAxKS4KICAgIC8vIEtlZXBzIGJvdHMsIHByZXJlbmRlciBjYWNoZSBrZXlzLCBhbmQgY2Fub25pY2FsIHRhZ3Mgb24gYSBzaW5nbGUgaG9zdC4KICAgIGlmICh1cmwuaG9zdG5hbWUgPT09ICJ3d3cucG9kaXZlcnp1bS5jb20iKSB7CiAgICAgIGNvbnN0IHRhcmdldCA9IGBodHRwczovL3BvZGl2ZXJ6dW0uY29tJHt1cmwucGF0aG5hbWV9JHt1cmwuc2VhcmNofWA7CiAgICAgIHJldHVybiBSZXNwb25zZS5yZWRpcmVjdCh0YXJnZXQsIDMwMSk7CiAgICB9CgogICAgLy8gQmxvY2sgcmVxdWVzdHMgd2l0aCBuby9lbXB0eSBVc2VyLUFnZW50IOKAlCByZWFsIGJyb3dzZXJzIGFuZCBsZWdpdCBib3RzCiAgICAvLyBhbHdheXMgc2VuZCBvbmUuIEVtcHR5IFVBID0gc2NyYXBlciAvIGRpcmVjdCBBUEkgaGl0LiBBbGxvdyAvc2l0ZW1hcC54bWwKICAgIC8vIGFuZCByb2JvdHMudHh0IGJlY2F1c2Ugc29tZSBmZXRjaGVycyBvbWl0IFVBIG9uIHRob3NlLgogICAgaWYgKAogICAgICAhdWEudHJpbSgpICYmCiAgICAgIHVybC5wYXRobmFtZSAhPT0gIi9zaXRlbWFwLnhtbCIgJiYKICAgICAgdXJsLnBhdGhuYW1lICE9PSAiL3JvYm90cy50eHQiCiAgICApIHsKICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZSgiRm9yYmlkZGVuIiwgewogICAgICAgIHN0YXR1czogNDAzLAogICAgICAgIGhlYWRlcnM6IHsKICAgICAgICAgICJDb250ZW50LVR5cGUiOiAidGV4dC9wbGFpbjsgY2hhcnNldD11dGYtOCIsCiAgICAgICAgICAiQ2FjaGUtQ29udHJvbCI6ICJwdWJsaWMsIG1heC1hZ2U9MzYwMCIsCiAgICAgICAgICAiWC1CbG9ja2VkIjogIm5vLXVzZXItYWdlbnQiLAogICAgICAgIH0sCiAgICAgIH0pOwogICAgfQoKICAgIGlmIChTQ0FOTkVSX1BBVEhfUkVHRVgudGVzdCh1cmwucGF0aG5hbWUpKSB7CiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoIk5vdCBGb3VuZCIsIHsKICAgICAgICBzdGF0dXM6IDQwNCwKICAgICAgICBoZWFkZXJzOiB7CiAgICAgICAgICAiQ29udGVudC1UeXBlIjogInRleHQvcGxhaW47IGNoYXJzZXQ9dXRmLTgiLAogICAgICAgICAgIkNhY2hlLUNvbnRyb2wiOiAicHVibGljLCBtYXgtYWdlPTg2NDAwIiwKICAgICAgICAgICJYLUJsb2NrZWQiOiAic2Nhbm5lci1wYXRoIiwKICAgICAgICB9LAogICAgICB9KTsKICAgIH0KCiAgICAvLyBEeW5hbWljIHNpdGVtYXAgcHJveHkg4oCUIC9zaXRlbWFwLnhtbCAoYW5kIC9zaXRlbWFwLnhtbD90eXBlPS4uLikg4oaSIGVkZ2UgZm4uCiAgICAvLyBTdGF0aWMgcHVibGljL3NpdGVtYXAueG1sIGlzIGJ5cGFzc2VkOyBHb29nbGUgc2VlcyBsaXZlIGVwaXNvZGUgY292ZXJhZ2UuCiAgICBpZiAocmVxdWVzdC5tZXRob2QgPT09ICJHRVQiICYmIHVybC5wYXRobmFtZSA9PT0gIi9zaXRlbWFwLnhtbCIpIHsKICAgICAgY29uc3QgdXBzdHJlYW1VcmwgPSBgJHtTSVRFTUFQX0VORFBPSU5UfSR7dXJsLnNlYXJjaH1gOwogICAgICB0cnkgewogICAgICAgIGNvbnN0IHVwc3RyZWFtID0gYXdhaXQgZmV0Y2godXBzdHJlYW1VcmwsIHsKICAgICAgICAgIGNmOiB7IGNhY2hlVHRsOiAzNjAwLCBjYWNoZUV2ZXJ5dGhpbmc6IHRydWUgfSwKICAgICAgICAgIGhlYWRlcnM6IHsgIlVzZXItQWdlbnQiOiAicG9kaXZlcnp1bS1jZi13b3JrZXIiIH0sCiAgICAgICAgfSk7CiAgICAgICAgaWYgKHVwc3RyZWFtLm9rKSB7CiAgICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgdXBzdHJlYW0udGV4dCgpOwogICAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShib2R5LCB7CiAgICAgICAgICAgIHN0YXR1czogMjAwLAogICAgICAgICAgICBoZWFkZXJzOiB7CiAgICAgICAgICAgICAgIkNvbnRlbnQtVHlwZSI6ICJhcHBsaWNhdGlvbi94bWw7IGNoYXJzZXQ9dXRmLTgiLAogICAgICAgICAgICAgICJDYWNoZS1Db250cm9sIjogInB1YmxpYywgbWF4LWFnZT0zNjAwIiwKICAgICAgICAgICAgICAiWC1TaXRlbWFwLVNvdXJjZSI6ICJlZGdlLWZuIiwKICAgICAgICAgICAgfSwKICAgICAgICAgIH0pOwogICAgICAgIH0KICAgICAgfSBjYXRjaCAoXykgeyAvKiBmYWxsIHRocm91Z2ggdG8gb3JpZ2luICovIH0KICAgICAgcmV0dXJuIGZldGNoKHJlcXVlc3QpOwogICAgfQoKICAgIC8vIE9ubHkgaGFuZGxlIEdFVHMgZnJvbSBib3RzIG9uIHByZXJlbmRlcmFibGUgcGF0aHMuCiAgICBpZiAoCiAgICAgIHJlcXVlc3QubWV0aG9kICE9PSAiR0VUIiB8fAogICAgICAhaXNCb3QodWEpIHx8CiAgICAgICFzaG91bGRQcmVyZW5kZXIodXJsLnBhdGhuYW1lKQogICAgKSB7CiAgICAgIHJldHVybiBmZXRjaChyZXF1ZXN0KTsKICAgIH0KCiAgICAvLyBDYWNoZSBrZXk6IHNjaGVtZSArIGhvc3QgKyBwYXRoIChpZ25vcmUgcXVlcnkgZm9yIHN0YWJpbGl0eTsKICAgIC8vIHdlIGRvbid0IHByZXJlbmRlciBwZXItcXVlcnkgdmFyaWFudHMpLgogICAgY29uc3QgY2FjaGVLZXkgPSBuZXcgUmVxdWVzdCgKICAgICAgYCR7dXJsLm9yaWdpbn0ke3VybC5wYXRobmFtZX1gLAogICAgICB7IG1ldGhvZDogIkdFVCIgfSwKICAgICk7CiAgICBjb25zdCBjYWNoZSA9IGNhY2hlcy5kZWZhdWx0OwoKICAgIGxldCByZXNwID0gYXdhaXQgY2FjaGUubWF0Y2goY2FjaGVLZXkpOwogICAgaWYgKHJlc3ApIHsKICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShyZXNwLmJvZHksIHsKICAgICAgICBzdGF0dXM6IHJlc3Auc3RhdHVzLAogICAgICAgIGhlYWRlcnM6IG5ldyBIZWFkZXJzKFsKICAgICAgICAgIC4uLnJlc3AuaGVhZGVycywKICAgICAgICAgIFsiWC1QcmVyZW5kZXItQ2FjaGUiLCAiSElUIl0sCiAgICAgICAgXSksCiAgICAgIH0pOwogICAgfQoKICAgIC8vIEZldGNoIGZyb20gU3VwYWJhc2UgcHJlcmVuZGVyIGVkZ2UgZm4uCiAgICBjb25zdCBwcmVyZW5kZXJVcmwgPSBgJHtQUkVSRU5ERVJfRU5EUE9JTlR9P3BhdGg9JHtlbmNvZGVVUklDb21wb25lbnQodXJsLnBhdGhuYW1lKX1gOwogICAgbGV0IHVwc3RyZWFtOwogICAgdHJ5IHsKICAgICAgdXBzdHJlYW0gPSBhd2FpdCBmZXRjaChwcmVyZW5kZXJVcmwsIHsKICAgICAgICBjZjogeyBjYWNoZVR0bDogMCwgY2FjaGVFdmVyeXRoaW5nOiBmYWxzZSB9LAogICAgICAgIGhlYWRlcnM6IHsgIlVzZXItQWdlbnQiOiAicG9kaXZlcnp1bS1jZi13b3JrZXIiIH0sCiAgICAgIH0pOwogICAgfSBjYXRjaCAoZXJyKSB7CiAgICAgIC8vIE9uIGZhaWx1cmUsIGZhbGwgYmFjayB0byBvcmlnaW4gc28gdGhlIGJvdCBzdGlsbCBnZXRzICpzb21ldGhpbmcqLgogICAgICByZXR1cm4gZmV0Y2gocmVxdWVzdCk7CiAgICB9CgogICAgaWYgKCF1cHN0cmVhbS5vaykgewogICAgICAvLyA0eHgvNXh4IGZyb20gcHJlcmVuZGVyIOKAlCBmYWxsIGJhY2sgdG8gb3JpZ2luLgogICAgICByZXR1cm4gZmV0Y2gocmVxdWVzdCk7CiAgICB9CgogICAgY29uc3QgYm9keSA9IGF3YWl0IHVwc3RyZWFtLnRleHQoKTsKICAgIGNvbnN0IGhlYWRlcnMgPSBuZXcgSGVhZGVycyh7CiAgICAgICJDb250ZW50LVR5cGUiOiAidGV4dC9odG1sOyBjaGFyc2V0PXV0Zi04IiwKICAgICAgIkNhY2hlLUNvbnRyb2wiOiAicHVibGljLCBtYXgtYWdlPTg2NDAwIiwKICAgICAgIlgtUHJlcmVuZGVyLUNhY2hlIjogIk1JU1MiLAogICAgICAiWC1QcmVyZW5kZXItVUEiOiB1YS5zbGljZSgwLCA4MCksCiAgICB9KTsKICAgIHJlc3AgPSBuZXcgUmVzcG9uc2UoYm9keSwgeyBzdGF0dXM6IHVwc3RyZWFtLnN0YXR1cywgaGVhZGVycyB9KTsKCiAgICAvLyBTdGFzaCBpbiBlZGdlIGNhY2hlIGZvciBuZXh0IGJvdCBoaXQgKDI0aCkuCiAgICBjdHgud2FpdFVudGlsKGNhY2hlLnB1dChjYWNoZUtleSwgcmVzcC5jbG9uZSgpKSk7CiAgICByZXR1cm4gcmVzcDsKICB9LAp9Owo=";
const SCRIPT_NAME = "podiverzum-bot-prerender";
const ZONE_NAME = "podiverzum.com";
const ROUTE_PATTERNS = ["podiverzum.com/*", "www.podiverzum.com/*"];

const CF = "https://api.cloudflare.com/client/v4";

async function cf(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${CF}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, ok: res.ok, json, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "CLOUDFLARE_API_TOKEN missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const log: any[] = [];
  try {
    // 1. Resolve account id
    const accounts = await cf(token, "/accounts");
    if (!accounts.ok) throw new Error(`accounts: ${accounts.status} ${accounts.text}`);
    const accountId = accounts.json?.result?.[0]?.id;
    if (!accountId) throw new Error("no account in token");
    log.push({ step: "account", accountId });

    // 2. Resolve zone id
    const zones = await cf(token, `/zones?name=${ZONE_NAME}`);
    if (!zones.ok) throw new Error(`zones: ${zones.status} ${zones.text}`);
    const zoneId = zones.json?.result?.[0]?.id;
    if (!zoneId) throw new Error(`zone ${ZONE_NAME} not found`);
    log.push({ step: "zone", zoneId });

    // 3. Decode worker source
    const bin = Uint8Array.from(atob(WORKER_SRC_B64), c => c.charCodeAt(0));
    const workerJs = new TextDecoder().decode(bin);
    log.push({ step: "source", bytes: workerJs.length });

    // 4. Upload script (modules syntax)
    const fd = new FormData();
    const metadata = { main_module: "worker.js", compatibility_date: "2025-01-01" };
    fd.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    fd.append("worker.js", new Blob([workerJs], { type: "application/javascript+module" }), "worker.js");

    const upload = await fetch(`${CF}/accounts/${accountId}/workers/scripts/${SCRIPT_NAME}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const uploadText = await upload.text();
    if (!upload.ok) throw new Error(`upload: ${upload.status} ${uploadText}`);
    log.push({ step: "upload", status: upload.status });

    // 5. Check routes
    const routes = await cf(token, `/zones/${zoneId}/workers/routes`);
    if (!routes.ok) throw new Error(`routes: ${routes.status} ${routes.text}`);
    const existing = routes.json?.result || [];
    log.push({ step: "routes_existing", routes: existing });

    const created: any[] = [];
    for (const pattern of ROUTE_PATTERNS) {
      const hit = existing.find((r: any) => r.pattern === pattern);
      if (!hit) {
        const c = await cf(token, `/zones/${zoneId}/workers/routes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern, script: SCRIPT_NAME }),
        });
        created.push({ pattern, status: c.status, ok: c.ok, body: c.text });
      } else if (hit.script !== SCRIPT_NAME) {
        // Rebind to our script
        const u = await cf(token, `/zones/${zoneId}/workers/routes/${hit.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern, script: SCRIPT_NAME }),
        });
        created.push({ pattern, rebound: true, from: hit.script, status: u.status, body: u.text });
      }
    }
    log.push({ step: "routes_created", created });

    return new Response(JSON.stringify({ ok: true, log }, null, 2), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e), log }, null, 2), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
