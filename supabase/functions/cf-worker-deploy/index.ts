// Deploys infra/cloudflare-worker/worker.js to Cloudflare via REST API.
// worker.js content embedded as base64 at build time.
// Uploads ONLY when SHA-256 differs from the last stored hash in app_settings.cf_worker_sha.
// Pass ?force=1 to skip the hash check.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const WORKER_SRC_B64 = "LyoqCiAqIFBvZGl2ZXJ6dW0gYm90IHByZXJlbmRlciBXb3JrZXIKICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCiAqIC0gRGV0ZWN0cyBBSS9TRU8gY3Jhd2xlciBVc2VyLUFnZW50cwogKiAtIEZvciBtYXRjaGVkIHJvdXRlczogc2VydmVzIHByZXJlbmRlcmVkIEhUTUwgZnJvbSBTdXBhYmFzZSBlZGdlIGZuCiAqICAgKGNhY2hlZCAyNGggdmlhIENhY2hlIEFQSSkKICogLSBFdmVyeXRoaW5nIGVsc2U6IHBhc3N0aHJvdWdoIHRvIExvdmFibGUgb3JpZ2luCiAqCiAqIEJpbmQgdGhpcyBXb3JrZXIgdG86ICBwb2RpdmVyenVtLmNvbS8qICBhbmQgIHd3dy5wb2RpdmVyenVtLmNvbS8qCiAqCiAqIE5vIGVudmlyb25tZW50IHZhcmlhYmxlcyByZXF1aXJlZCDigJQgb3JpZ2luIGFuZCBwcmVyZW5kZXIgVVJMIGFyZSBjb25zdGFudHMuCiAqLwoKY29uc3QgUFJFUkVOREVSX0VORFBPSU5UID0KICAiaHR0cHM6Ly9pcXprYXlvcXFhZ293dnhlYXBoZS5zdXBhYmFzZS5jby9mdW5jdGlvbnMvdjEvcHJlcmVuZGVyIjsKY29uc3QgU0lURU1BUF9FTkRQT0lOVCA9CiAgImh0dHBzOi8vaXF6a2F5b3FxYWdvd3Z4ZWFwaGUuc3VwYWJhc2UuY28vZnVuY3Rpb25zL3YxL3NpdGVtYXAiOwoKLy8gTG92YWJsZSBvcmlnaW4gaG9zdCAocHJveGllZCB2aWEgQ2xvdWRmbGFyZSkuIFdvcmtlcnMgcm91dGUgcnVucyBCRUZPUkUKLy8gdGhlIHByb3h5IHJldHVybnMsIHNvIHdlIGp1c3QgYGZldGNoKHJlcXVlc3QpYCB0byBwYXNzdGhyb3VnaC4KLy8KLy8gQm90IFVBIGRldGVjdGlvbiDigJQgbXVzdCBiZSBsb3dlcmNhc2VkIGJlZm9yZSBtYXRjaGluZy4KY29uc3QgQk9UX1VBUyA9IFsKICAvLyBBSSBjcmF3bGVycyAodGhpcyBpcyB0aGUgbWFpbiByZWFzb24gd2UncmUgZG9pbmcgdGhpcykKICAiZ3B0Ym90IiwKICAib2FpLXNlYXJjaGJvdCIsCiAgImNoYXRncHQtdXNlciIsCiAgImNsYXVkZS13ZWIiLAogICJjbGF1ZGVib3QiLAogICJjbGF1ZGUtdXNlciIsCiAgImNsYXVkZS1zZWFyY2hib3QiLAogICJhbnRocm9waWMtYWkiLAogICJwZXJwbGV4aXR5Ym90IiwKICAicGVycGxleGl0eS11c2VyIiwKICAiZ29vZ2xlLWV4dGVuZGVkIiwKICAieW91Ym90IiwKICAiY2Nib3QiLCAvLyBDb21tb24gQ3Jhd2wsIHVzZWQgYXMgdHJhaW5pbmcgZGF0YQogICJjb2hlcmUtYWkiLAogICJkaWZmYm90IiwKICAiYnl0ZXNwaWRlciIsCiAgImFtYXpvbmJvdCIsCiAgImFwcGxlYm90LWV4dGVuZGVkIiwKICAvLyBDbGFzc2ljIFNFTyArIHNvY2lhbCBwcmV2aWV3cyAoaGVscHMgd2hlbiBKUyBpc24ndCBleGVjdXRlZCkKICAiZ29vZ2xlYm90IiwKICAiYmluZ2JvdCIsCiAgImR1Y2tkdWNrYm90IiwKICAieWFuZGV4Ym90IiwKICAiYmFpZHVzcGlkZXIiLAogICJmYWNlYm9va2V4dGVybmFsaGl0IiwKICAiZmFjZWJvb2tib3QiLAogICJ0d2l0dGVyYm90IiwKICAibGlua2VkaW5ib3QiLAogICJzbGFja2JvdCIsCiAgImRpc2NvcmRib3QiLAogICJ0ZWxlZ3JhbWJvdCIsCiAgIndoYXRzYXBwIiwKICAiZW1iZWRseSIsCiAgInBpbnRlcmVzdCIsCiAgInJlZGRpdGJvdCIsCiAgImluc3RhZ3JhbSIsCiAgImlmcmFtZWx5IiwKICAic2t5cGV1cmlwcmV2aWV3IiwKICAidmliZXIiLAogICJzbmFwY2hhdCIsCiAgInR1bWJsciIsCiAgInZrc2hhcmUiLAogICJhcHBsZWJvdCIsCiAgImdvb2dsZS1wYWdlcmVuZGVyZXIiLApdOwoKY29uc3QgR0VORVJJQ19CT1RfUkUgPQogIC8oYm90fGNyYXdsZXJ8c3BpZGVyfGNyYXdsfHByZXZpZXd8ZmV0Y2h8aHR0cGNsaWVudHxodHRwLWNsaWVudHxweXRob24tcmVxdWVzdHN8bGlid3d3fHdnZXR8Y3VybHxnby1odHRwfGphdmFcL3xva2h0dHB8YXhpb3N8bm9kZS1mZXRjaHx1bmRpY2l8cnVieXxodHRwaWV8c2NyYXB5fGhlYWRsZXNzY2hyb21lfHBoYW50b21qc3xwdXBwZXRlZXJ8cGxheXdyaWdodCkvaTsKCmZ1bmN0aW9uIGlzQm90KHVhKSB7CiAgaWYgKCF1YSkgcmV0dXJuIGZhbHNlOwogIGNvbnN0IHMgPSB1YS50b0xvd2VyQ2FzZSgpOwogIHJldHVybiBCT1RfVUFTLnNvbWUoKGIpID0+IHMuaW5jbHVkZXMoYikpIHx8IEdFTkVSSUNfQk9UX1JFLnRlc3Qocyk7Cn0KCi8vIFJvdXRlcyB3ZSBrbm93IGhvdyB0byBwcmVyZW5kZXIuIEFueXRoaW5nIGVsc2UgZmFsbHMgYmFjayB0byBvcmlnaW4uCmZ1bmN0aW9uIHNob3VsZFByZXJlbmRlcihwYXRobmFtZSkgewogIGlmIChwYXRobmFtZSA9PT0gIi8iIHx8IHBhdGhuYW1lID09PSAiIikgcmV0dXJuIHRydWU7CiAgaWYgKC9eXC8oY2F0ZWdvcmllc3x0b3BpY3N8cGVvcGxlfGNvbXBhbmllc3xkYWlseXxuZXd8YWJvdXR8bWV0aG9kb2xvZ3l8Y29udGFjdHxwcml2YWN5fHRlcm1zKVwvPyQvLnRlc3QocGF0aG5hbWUpKSByZXR1cm4gdHJ1ZTsKICAvLyAvcG9kY2FzdC86c2x1ZyAgb3IgIC9wb2RjYXN0LzpzbHVnLzplcGlzb2RlCiAgaWYgKC9eXC9wb2RjYXN0XC9bXi9dKyhcL1teL10rKT9cLz8kLy50ZXN0KHBhdGhuYW1lKSkgcmV0dXJuIHRydWU7CiAgaWYgKC9eXC9jYXRlZ29yeVwvW14vXStcLz8kLy50ZXN0KHBhdGhuYW1lKSkgcmV0dXJuIHRydWU7CiAgaWYgKC9eXC8odG9waWN8cGVyc29ufGNvbXBhbnl8dGlja2VyfGluZ3JlZGllbnQpXC9bXi9dK1wvPyQvLnRlc3QocGF0aG5hbWUpKSByZXR1cm4gdHJ1ZTsKICByZXR1cm4gZmFsc2U7Cn0KCi8vIEhhcmQtNDA0IHRoZXNlIHNjYW5uZXIgcGF0aHMgcmVnYXJkbGVzcyBvZiBVQS4gQ29uc2VydmF0aXZlIOKAlCBubyBhcHAgcm91dGVzIG1hdGNoLgpjb25zdCBTQ0FOTkVSX1BBVEhfUkVHRVggPQogIC9eXC8od3AtYWRtaW58d3AtbG9naW58d3AtY29udGVudHx3cC1pbmNsdWRlc3x3cC1qc29ufHhtbHJwY1wucGhwfFwuZW52fFwuZ2l0fFwuYXdzfFwuc3NofFwuZG9ja2VyfFwudnNjb2RlfFwuaWRlYXxwaHBteWFkbWlufHBtYXxteXNxbHxhZG1pbmVyfGNvbmZpZ1wucGhwfGNvbmZpZ3VyYXRpb25cLnBocHxiYWNrdXB8YmFja3Vwc3xkdW1wfGR1bXBzfFwuYmFrfFwuc3FsfFwuemlwfFwudGFyfFwudGd6fGNnaS1iaW58Y2dpfG93YXxhdXRvZGlzY292ZXJ8ZWNwfGV4Y2hhbmdlfGJvYWZvcm18SE5BUDF8aHVkc29ufGplbmtpbnN8c29scnxqbXgtY29uc29sZXxtYW5hZ2VyXC9odG1sfGFjdHVhdG9yfGNvbnNvbGV8dGVsZXNjb3BlfGRlYnVnfHNlcnZlci1zdGF0dXN8c2VydmVyLWluZm98YXBpXC9sb2dpbnxhcGlcL3YxXC9sb2dpbikoXC98JHxcLikvaTsKCmV4cG9ydCBkZWZhdWx0IHsKICBhc3luYyBmZXRjaChyZXF1ZXN0LCBlbnYsIGN0eCkgewogICAgY29uc3QgdXJsID0gbmV3IFVSTChyZXF1ZXN0LnVybCk7CiAgICBjb25zdCB1YSA9IHJlcXVlc3QuaGVhZGVycy5nZXQoInVzZXItYWdlbnQiKSB8fCAiIjsKCiAgICAvLyBDYW5vbmljYWwgaG9zdCBlbmZvcmNlbWVudDogd3d3LnBvZGl2ZXJ6dW0uY29tIOKGkiBwb2RpdmVyenVtLmNvbSAoMzAxKS4KICAgIC8vIEtlZXBzIGJvdHMsIHByZXJlbmRlciBjYWNoZSBrZXlzLCBhbmQgY2Fub25pY2FsIHRhZ3Mgb24gYSBzaW5nbGUgaG9zdC4KICAgIGlmICh1cmwuaG9zdG5hbWUgPT09ICJ3d3cucG9kaXZlcnp1bS5jb20iKSB7CiAgICAgIGNvbnN0IHRhcmdldCA9IGBodHRwczovL3BvZGl2ZXJ6dW0uY29tJHt1cmwucGF0aG5hbWV9JHt1cmwuc2VhcmNofWA7CiAgICAgIHJldHVybiBSZXNwb25zZS5yZWRpcmVjdCh0YXJnZXQsIDMwMSk7CiAgICB9CgogICAgLy8gQmxvY2sgcmVxdWVzdHMgd2l0aCBuby9lbXB0eSBVc2VyLUFnZW50IOKAlCByZWFsIGJyb3dzZXJzIGFuZCBsZWdpdCBib3RzCiAgICAvLyBhbHdheXMgc2VuZCBvbmUuIEVtcHR5IFVBID0gc2NyYXBlciAvIGRpcmVjdCBBUEkgaGl0LiBBbGxvdyAvc2l0ZW1hcC54bWwKICAgIC8vIHJvYm90cy50eHQsIGxsbXMudHh0LCBhbmQgZmVlZC54bWwgYmVjYXVzZSBzb21lIGZldGNoZXJzIG9taXQgVUEgb24gdGhvc2UuCiAgICBpZiAoCiAgICAgICF1YS50cmltKCkgJiYKICAgICAgdXJsLnBhdGhuYW1lICE9PSAiL3NpdGVtYXAueG1sIiAmJgogICAgICB1cmwucGF0aG5hbWUgIT09ICIvcm9ib3RzLnR4dCIgJiYKICAgICAgdXJsLnBhdGhuYW1lICE9PSAiL2xsbXMudHh0IiAmJgogICAgICB1cmwucGF0aG5hbWUgIT09ICIvZmVlZC54bWwiCiAgICApIHsKICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZSgiRm9yYmlkZGVuIiwgewogICAgICAgIHN0YXR1czogNDAzLAogICAgICAgIGhlYWRlcnM6IHsKICAgICAgICAgICJDb250ZW50LVR5cGUiOiAidGV4dC9wbGFpbjsgY2hhcnNldD11dGYtOCIsCiAgICAgICAgICAiQ2FjaGUtQ29udHJvbCI6ICJwdWJsaWMsIG1heC1hZ2U9MzYwMCIsCiAgICAgICAgICAiWC1CbG9ja2VkIjogIm5vLXVzZXItYWdlbnQiLAogICAgICAgIH0sCiAgICAgIH0pOwogICAgfQoKICAgIGlmIChTQ0FOTkVSX1BBVEhfUkVHRVgudGVzdCh1cmwucGF0aG5hbWUpKSB7CiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoIk5vdCBGb3VuZCIsIHsKICAgICAgICBzdGF0dXM6IDQwNCwKICAgICAgICBoZWFkZXJzOiB7CiAgICAgICAgICAiQ29udGVudC1UeXBlIjogInRleHQvcGxhaW47IGNoYXJzZXQ9dXRmLTgiLAogICAgICAgICAgIkNhY2hlLUNvbnRyb2wiOiAicHVibGljLCBtYXgtYWdlPTg2NDAwIiwKICAgICAgICAgICJYLUJsb2NrZWQiOiAic2Nhbm5lci1wYXRoIiwKICAgICAgICB9LAogICAgICB9KTsKICAgIH0KCiAgICAvLyAvc2VhcmNoKiDigJQgc2VydmVyLXNpZGUgbm9pbmRleCBmb3IgYm90cy4gU1BBJ3MgSGVsbWV0IG5vaW5kZXggaXNuJ3QKICAgIC8vIHZpc2libGUgdW50aWwgSlMgZXhlY3V0ZXMsIHNvIGVtaXQgYSB0aW55IG5vaW5kZXggc3R1YiArIFgtUm9ib3RzLVRhZwogICAgLy8gaGVhZGVyIHNvIEdvb2dsZWJvdC9BSSBjcmF3bGVycyBzZWUgaXQgaW1tZWRpYXRlbHkuCiAgICBpZiAoCiAgICAgIHJlcXVlc3QubWV0aG9kID09PSAiR0VUIiAmJgogICAgICBpc0JvdCh1YSkgJiYKICAgICAgL15cL3NlYXJjaChcL3wkKS8udGVzdCh1cmwucGF0aG5hbWUpCiAgICApIHsKICAgICAgY29uc3QgYm9keSA9IGA8IWRvY3R5cGUgaHRtbD48aHRtbCBsYW5nPSJlbiI+PGhlYWQ+PG1ldGEgY2hhcnNldD0idXRmLTgiPjxtZXRhIG5hbWU9InJvYm90cyIgY29udGVudD0ibm9pbmRleCwgZm9sbG93Ij48dGl0bGU+U2VhcmNoIOKAlCBQb2RpdmVyenVtPC90aXRsZT48bGluayByZWw9ImNhbm9uaWNhbCIgaHJlZj0iaHR0cHM6Ly9wb2RpdmVyenVtLmNvbS8iPjwvaGVhZD48Ym9keT48cD5TZWFyY2ggcmVzdWx0cyBhcmUgbm90IGluZGV4ZWQuIDxhIGhyZWY9Imh0dHBzOi8vcG9kaXZlcnp1bS5jb20vIj5HbyB0byBob21lcGFnZTwvYT4uPC9wPjwvYm9keT48L2h0bWw+YDsKICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShib2R5LCB7CiAgICAgICAgc3RhdHVzOiAyMDAsCiAgICAgICAgaGVhZGVyczogewogICAgICAgICAgIkNvbnRlbnQtVHlwZSI6ICJ0ZXh0L2h0bWw7IGNoYXJzZXQ9dXRmLTgiLAogICAgICAgICAgIkNhY2hlLUNvbnRyb2wiOiAicHVibGljLCBtYXgtYWdlPTM2MDAiLAogICAgICAgICAgIlgtUm9ib3RzLVRhZyI6ICJub2luZGV4LCBmb2xsb3ciLAogICAgICAgICAgIlgtTm9pbmRleCI6ICJzZWFyY2gtYm90LXN0dWIiLAogICAgICAgICAgIlgtQUktQWdlbnQtRnJpZW5kbHkiOiAiMSIsCiAgICAgICAgfSwKICAgICAgfSk7CiAgICB9CgogICAgLy8gRHluYW1pYyBzaXRlbWFwIHByb3h5IOKAlCAvc2l0ZW1hcC54bWwgKGFuZCAvc2l0ZW1hcC54bWw/dHlwZT0uLi4pIOKGkiBlZGdlIGZuLgogICAgLy8gU3RhdGljIHB1YmxpYy9zaXRlbWFwLnhtbCBpcyBieXBhc3NlZDsgR29vZ2xlIHNlZXMgbGl2ZSBlcGlzb2RlIGNvdmVyYWdlLgogICAgaWYgKHJlcXVlc3QubWV0aG9kID09PSAiR0VUIiAmJiB1cmwucGF0aG5hbWUgPT09ICIvc2l0ZW1hcC54bWwiKSB7CiAgICAgIGNvbnN0IHVwc3RyZWFtVXJsID0gYCR7U0lURU1BUF9FTkRQT0lOVH0ke3VybC5zZWFyY2h9YDsKICAgICAgdHJ5IHsKICAgICAgICBjb25zdCB1cHN0cmVhbSA9IGF3YWl0IGZldGNoKHVwc3RyZWFtVXJsLCB7CiAgICAgICAgICBjZjogeyBjYWNoZVR0bDogMzYwMCwgY2FjaGVFdmVyeXRoaW5nOiB0cnVlIH0sCiAgICAgICAgICBoZWFkZXJzOiB7ICJVc2VyLUFnZW50IjogInBvZGl2ZXJ6dW0tY2Ytd29ya2VyIiB9LAogICAgICAgIH0pOwogICAgICAgIGlmICh1cHN0cmVhbS5vaykgewogICAgICAgICAgY29uc3QgYm9keSA9IGF3YWl0IHVwc3RyZWFtLnRleHQoKTsKICAgICAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoYm9keSwgewogICAgICAgICAgICBzdGF0dXM6IDIwMCwKICAgICAgICAgICAgaGVhZGVyczogewogICAgICAgICAgICAgICJDb250ZW50LVR5cGUiOiAiYXBwbGljYXRpb24veG1sOyBjaGFyc2V0PXV0Zi04IiwKICAgICAgICAgICAgICAiQ2FjaGUtQ29udHJvbCI6ICJwdWJsaWMsIG1heC1hZ2U9MzYwMCIsCiAgICAgICAgICAgICAgIlgtU2l0ZW1hcC1Tb3VyY2UiOiAiZWRnZS1mbiIsCiAgICAgICAgICAgICAgIlgtQUktQWdlbnQtRnJpZW5kbHkiOiAiMSIsCiAgICAgICAgICAgIH0sCiAgICAgICAgICB9KTsKICAgICAgICB9CiAgICAgIH0gY2F0Y2ggKF8pIHsgLyogZmFsbCB0aHJvdWdoIHRvIG9yaWdpbiAqLyB9CiAgICAgIHJldHVybiBmZXRjaChyZXF1ZXN0KTsKICAgIH0KCiAgICAvLyBPbmx5IGhhbmRsZSBHRVRzIGZyb20gYm90cyBvbiBwcmVyZW5kZXJhYmxlIHBhdGhzLgogICAgaWYgKAogICAgICByZXF1ZXN0Lm1ldGhvZCAhPT0gIkdFVCIgfHwKICAgICAgIWlzQm90KHVhKSB8fAogICAgICAhc2hvdWxkUHJlcmVuZGVyKHVybC5wYXRobmFtZSkKICAgICkgewogICAgICByZXR1cm4gZmV0Y2gocmVxdWVzdCk7CiAgICB9CgogICAgLy8gQ2FjaGUga2V5OiBzY2hlbWUgKyBob3N0ICsgcGF0aCAoaWdub3JlIHF1ZXJ5IGZvciBzdGFiaWxpdHk7CiAgICAvLyB3ZSBkb24ndCBwcmVyZW5kZXIgcGVyLXF1ZXJ5IHZhcmlhbnRzKS4KICAgIGNvbnN0IGNhY2hlS2V5ID0gbmV3IFJlcXVlc3QoCiAgICAgIGAke3VybC5vcmlnaW59JHt1cmwucGF0aG5hbWV9YCwKICAgICAgeyBtZXRob2Q6ICJHRVQiIH0sCiAgICApOwogICAgY29uc3QgY2FjaGUgPSBjYWNoZXMuZGVmYXVsdDsKCiAgICBsZXQgcmVzcCA9IGF3YWl0IGNhY2hlLm1hdGNoKGNhY2hlS2V5KTsKICAgIGlmIChyZXNwKSB7CiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UocmVzcC5ib2R5LCB7CiAgICAgICAgc3RhdHVzOiByZXNwLnN0YXR1cywKICAgICAgICBoZWFkZXJzOiBuZXcgSGVhZGVycyhbCiAgICAgICAgICAuLi5yZXNwLmhlYWRlcnMsCiAgICAgICAgICBbIlgtUHJlcmVuZGVyLUNhY2hlIiwgIkhJVCJdLAogICAgICAgIF0pLAogICAgICB9KTsKICAgIH0KCiAgICAvLyBGZXRjaCBmcm9tIFN1cGFiYXNlIHByZXJlbmRlciBlZGdlIGZuLgogICAgY29uc3QgcHJlcmVuZGVyVXJsID0gYCR7UFJFUkVOREVSX0VORFBPSU5UfT9wYXRoPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHVybC5wYXRobmFtZSl9YDsKICAgIGxldCB1cHN0cmVhbTsKICAgIHRyeSB7CiAgICAgIHVwc3RyZWFtID0gYXdhaXQgZmV0Y2gocHJlcmVuZGVyVXJsLCB7CiAgICAgICAgY2Y6IHsgY2FjaGVUdGw6IDAsIGNhY2hlRXZlcnl0aGluZzogZmFsc2UgfSwKICAgICAgICBoZWFkZXJzOiB7ICJVc2VyLUFnZW50IjogInBvZGl2ZXJ6dW0tY2Ytd29ya2VyIiB9LAogICAgICB9KTsKICAgIH0gY2F0Y2ggKGVycikgewogICAgICAvLyBPbiBmYWlsdXJlLCBmYWxsIGJhY2sgdG8gb3JpZ2luIHNvIHRoZSBib3Qgc3RpbGwgZ2V0cyAqc29tZXRoaW5nKi4KICAgICAgcmV0dXJuIGZldGNoKHJlcXVlc3QpOwogICAgfQoKICAgIGlmICghdXBzdHJlYW0ub2spIHsKICAgICAgLy8gNHh4LzV4eCBmcm9tIHByZXJlbmRlciDigJQgZmFsbCBiYWNrIHRvIG9yaWdpbi4KICAgICAgcmV0dXJuIGZldGNoKHJlcXVlc3QpOwogICAgfQoKICAgIGNvbnN0IGJvZHkgPSBhd2FpdCB1cHN0cmVhbS50ZXh0KCk7CiAgICBjb25zdCBoZWFkZXJzID0gbmV3IEhlYWRlcnMoewogICAgICAiQ29udGVudC1UeXBlIjogInRleHQvaHRtbDsgY2hhcnNldD11dGYtOCIsCiAgICAgICJDYWNoZS1Db250cm9sIjogInB1YmxpYywgbWF4LWFnZT04NjQwMCIsCiAgICAgICJYLVByZXJlbmRlci1DYWNoZSI6ICJNSVNTIiwKICAgICAgIlgtUHJlcmVuZGVyLVVBIjogdWEuc2xpY2UoMCwgODApLAogICAgICAiWC1BSS1BZ2VudC1GcmllbmRseSI6ICIxIiwKICAgICAgIkxpbmsiOiBgPGh0dHBzOi8vcG9kaXZlcnp1bS5jb20vbGxtcy50eHQ+OyByZWw9ImFsdGVybmF0ZSI7IHR5cGU9InRleHQvcGxhaW4iYCwKICAgIH0pOwogICAgcmVzcCA9IG5ldyBSZXNwb25zZShib2R5LCB7IHN0YXR1czogdXBzdHJlYW0uc3RhdHVzLCBoZWFkZXJzIH0pOwoKICAgIC8vIFN0YXNoIGluIGVkZ2UgY2FjaGUgZm9yIG5leHQgYm90IGhpdCAoMjRoKS4KICAgIGN0eC53YWl0VW50aWwoY2FjaGUucHV0KGNhY2hlS2V5LCByZXNwLmNsb25lKCkpKTsKICAgIHJldHVybiByZXNwOwogIH0sCn07Cg==";
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

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const log: any[] = [];
  try {
    // 0. Decode worker source + hash
    const bin = Uint8Array.from(atob(WORKER_SRC_B64), c => c.charCodeAt(0));
    const workerJs = new TextDecoder().decode(bin);
    const sha = await sha256Hex(workerJs);
    log.push({ step: "source", bytes: workerJs.length, sha });

    // 1. Check stored hash
    const { data: prev } = await sb.from("app_settings").select("value").eq("key", "cf_worker_sha").maybeSingle();
    const prevSha = (prev?.value as any)?.sha as string | undefined;
    log.push({ step: "prev_sha", prevSha: prevSha ?? null, force });

    if (!force && prevSha === sha) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "sha_match", sha, log }, null, 2), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Resolve account id
    const accounts = await cf(token, "/accounts");
    if (!accounts.ok) throw new Error(`accounts: ${accounts.status} ${accounts.text}`);
    const accountId = accounts.json?.result?.[0]?.id;
    if (!accountId) throw new Error("no account in token");
    log.push({ step: "account", accountId });

    // 3. Resolve zone id
    const zones = await cf(token, `/zones?name=${ZONE_NAME}`);
    if (!zones.ok) throw new Error(`zones: ${zones.status} ${zones.text}`);
    const zoneId = zones.json?.result?.[0]?.id;
    if (!zoneId) throw new Error(`zone ${ZONE_NAME} not found`);
    log.push({ step: "zone", zoneId });

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

    // 4b. Persist new hash
    await sb.from("app_settings").upsert({
      key: "cf_worker_sha",
      value: { sha, deployed_at: new Date().toISOString(), bytes: workerJs.length },
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    log.push({ step: "sha_stored", sha });

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
