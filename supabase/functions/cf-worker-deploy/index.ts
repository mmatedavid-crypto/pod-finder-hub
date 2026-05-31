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

const WORKER_SRC_B64 = "LyoqCiAqIFBvZGl2ZXJ6dW0gYm90IHByZXJlbmRlciBXb3JrZXIKICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCiAqIC0gRGV0ZWN0cyBBSS9TRU8gY3Jhd2xlciBVc2VyLUFnZW50cwogKiAtIEZvciBtYXRjaGVkIHJvdXRlczogc2VydmVzIHByZXJlbmRlcmVkIEhUTUwgZnJvbSBTdXBhYmFzZSBlZGdlIGZuCiAqICAgKGNhY2hlZCAyNGggdmlhIENhY2hlIEFQSSkKICogLSBFdmVyeXRoaW5nIGVsc2U6IHBhc3N0aHJvdWdoIHRvIExvdmFibGUgb3JpZ2luCiAqCiAqIEJpbmQgdGhpcyBXb3JrZXIgdG86ICBwb2RpdmVyenVtLmNvbS8qICBhbmQgIHd3dy5wb2RpdmVyenVtLmNvbS8qCiAqCiAqIE5vIGVudmlyb25tZW50IHZhcmlhYmxlcyByZXF1aXJlZCDigJQgb3JpZ2luIGFuZCBwcmVyZW5kZXIgVVJMIGFyZSBjb25zdGFudHMuCiAqLwoKY29uc3QgUFJFUkVOREVSX0VORFBPSU5UID0KICAiaHR0cHM6Ly9pcXprYXlvcXFhZ293dnhlYXBoZS5zdXBhYmFzZS5jby9mdW5jdGlvbnMvdjEvcHJlcmVuZGVyIjsKY29uc3QgU0lURU1BUF9FTkRQT0lOVCA9CiAgImh0dHBzOi8vaXF6a2F5b3FxYWdvd3Z4ZWFwaGUuc3VwYWJhc2UuY28vZnVuY3Rpb25zL3YxL3NpdGVtYXAiOwoKLy8gTG92YWJsZSBvcmlnaW4gaG9zdCAocHJveGllZCB2aWEgQ2xvdWRmbGFyZSkuIFdvcmtlcnMgcm91dGUgcnVucyBCRUZPUkUKLy8gdGhlIHByb3h5IHJldHVybnMsIHNvIHdlIGp1c3QgYGZldGNoKHJlcXVlc3QpYCB0byBwYXNzdGhyb3VnaC4KLy8KLy8gQm90IFVBIGRldGVjdGlvbiDigJQgbXVzdCBiZSBsb3dlcmNhc2VkIGJlZm9yZSBtYXRjaGluZy4KY29uc3QgQk9UX1VBUyA9IFsKICAvLyBBSSBjcmF3bGVycyAodGhpcyBpcyB0aGUgbWFpbiByZWFzb24gd2UncmUgZG9pbmcgdGhpcykKICAiZ3B0Ym90IiwKICAib2FpLXNlYXJjaGJvdCIsCiAgImNoYXRncHQtdXNlciIsCiAgImNsYXVkZS13ZWIiLAogICJjbGF1ZGVib3QiLAogICJjbGF1ZGUtdXNlciIsCiAgImNsYXVkZS1zZWFyY2hib3QiLAogICJhbnRocm9waWMtYWkiLAogICJwZXJwbGV4aXR5Ym90IiwKICAicGVycGxleGl0eS11c2VyIiwKICAiZ29vZ2xlLWV4dGVuZGVkIiwKICAieW91Ym90IiwKICAiY2Nib3QiLCAvLyBDb21tb24gQ3Jhd2wsIHVzZWQgYXMgdHJhaW5pbmcgZGF0YQogICJjb2hlcmUtYWkiLAogICJkaWZmYm90IiwKICAiYnl0ZXNwaWRlciIsCiAgImFtYXpvbmJvdCIsCiAgImFwcGxlYm90LWV4dGVuZGVkIiwKICAvLyBDbGFzc2ljIFNFTyArIHNvY2lhbCBwcmV2aWV3cyAoaGVscHMgd2hlbiBKUyBpc24ndCBleGVjdXRlZCkKICAiZ29vZ2xlYm90IiwKICAiYmluZ2JvdCIsCiAgImR1Y2tkdWNrYm90IiwKICAieWFuZGV4Ym90IiwKICAiYmFpZHVzcGlkZXIiLAogICJmYWNlYm9va2V4dGVybmFsaGl0IiwKICAiZmFjZWJvb2tib3QiLAogICJ0d2l0dGVyYm90IiwKICAibGlua2VkaW5ib3QiLAogICJzbGFja2JvdCIsCiAgImRpc2NvcmRib3QiLAogICJ0ZWxlZ3JhbWJvdCIsCiAgIndoYXRzYXBwIiwKICAiZW1iZWRseSIsCiAgInBpbnRlcmVzdCIsCiAgInJlZGRpdGJvdCIsCiAgImluc3RhZ3JhbSIsCiAgImlmcmFtZWx5IiwKICAic2t5cGV1cmlwcmV2aWV3IiwKICAidmliZXIiLAogICJzbmFwY2hhdCIsCiAgInR1bWJsciIsCiAgInZrc2hhcmUiLAogICJhcHBsZWJvdCIsCiAgImdvb2dsZS1wYWdlcmVuZGVyZXIiLApdOwoKY29uc3QgR0VORVJJQ19CT1RfUkUgPQogIC8oYm90fGNyYXdsZXJ8c3BpZGVyfGNyYXdsfHByZXZpZXd8ZmV0Y2h8aHR0cGNsaWVudHxodHRwLWNsaWVudHxweXRob24tcmVxdWVzdHN8bGlid3d3fHdnZXR8Y3VybHxnby1odHRwfGphdmFcL3xva2h0dHB8YXhpb3N8bm9kZS1mZXRjaHx1bmRpY2l8cnVieXxodHRwaWV8c2NyYXB5fGhlYWRsZXNzY2hyb21lfHBoYW50b21qc3xwdXBwZXRlZXJ8cGxheXdyaWdodCkvaTsKCmZ1bmN0aW9uIGlzQm90KHVhKSB7CiAgaWYgKCF1YSkgcmV0dXJuIGZhbHNlOwogIGNvbnN0IHMgPSB1YS50b0xvd2VyQ2FzZSgpOwogIHJldHVybiBCT1RfVUFTLnNvbWUoKGIpID0+IHMuaW5jbHVkZXMoYikpIHx8IEdFTkVSSUNfQk9UX1JFLnRlc3Qocyk7Cn0KCi8vIFJvdXRlcyB3ZSBrbm93IGhvdyB0byBwcmVyZW5kZXIuIEFueXRoaW5nIGVsc2UgZmFsbHMgYmFjayB0byBvcmlnaW4uCmZ1bmN0aW9uIHNob3VsZFByZXJlbmRlcihwYXRobmFtZSkgewogIGlmIChwYXRobmFtZSA9PT0gIi8iIHx8IHBhdGhuYW1lID09PSAiIikgcmV0dXJuIHRydWU7CiAgaWYgKC9eXC8oY2F0ZWdvcmllc3x0b3BpY3N8cGVvcGxlfGNvbXBhbmllc3xkYWlseXx0b3BsaXN0fHJhbmtpbmdzfG5ld3xhYm91dHxtZXRob2RvbG9neXxjb250YWN0fHByaXZhY3l8dGVybXMpXC8/JC8udGVzdChwYXRobmFtZSkpIHJldHVybiB0cnVlOwogIC8vIC9wb2RjYXN0LzpzbHVnICBvciAgL3BvZGNhc3QvOnNsdWcvOmVwaXNvZGUKICBpZiAoL15cL3BvZGNhc3RcL1teL10rKFwvW14vXSspP1wvPyQvLnRlc3QocGF0aG5hbWUpKSByZXR1cm4gdHJ1ZTsKICBpZiAoL15cL2NhdGVnb3J5XC9bXi9dK1wvPyQvLnRlc3QocGF0aG5hbWUpKSByZXR1cm4gdHJ1ZTsKICBpZiAoL15cLyh0b3BpY3xwZXJzb258Y29tcGFueXx0aWNrZXJ8aW5ncmVkaWVudClcL1teL10rXC8/JC8udGVzdChwYXRobmFtZSkpIHJldHVybiB0cnVlOwogIHJldHVybiBmYWxzZTsKfQoKLy8gSGFyZC00MDQgdGhlc2Ugc2Nhbm5lciBwYXRocyByZWdhcmRsZXNzIG9mIFVBLiBDb25zZXJ2YXRpdmUg4oCUIG5vIGFwcCByb3V0ZXMgbWF0Y2guCmNvbnN0IFNDQU5ORVJfUEFUSF9SRUdFWCA9CiAgL15cLyh3cC1hZG1pbnx3cC1sb2dpbnx3cC1jb250ZW50fHdwLWluY2x1ZGVzfHdwLWpzb258eG1scnBjXC5waHB8XC5lbnZ8XC5naXR8XC5hd3N8XC5zc2h8XC5kb2NrZXJ8XC52c2NvZGV8XC5pZGVhfHBocG15YWRtaW58cG1hfG15c3FsfGFkbWluZXJ8Y29uZmlnXC5waHB8Y29uZmlndXJhdGlvblwucGhwfGJhY2t1cHxiYWNrdXBzfGR1bXB8ZHVtcHN8XC5iYWt8XC5zcWx8XC56aXB8XC50YXJ8XC50Z3p8Y2dpLWJpbnxjZ2l8b3dhfGF1dG9kaXNjb3ZlcnxlY3B8ZXhjaGFuZ2V8Ym9hZm9ybXxITkFQMXxodWRzb258amVua2luc3xzb2xyfGpteC1jb25zb2xlfG1hbmFnZXJcL2h0bWx8YWN0dWF0b3J8Y29uc29sZXx0ZWxlc2NvcGV8ZGVidWd8c2VydmVyLXN0YXR1c3xzZXJ2ZXItaW5mb3xhcGlcL2xvZ2lufGFwaVwvdjFcL2xvZ2luKShcL3wkfFwuKS9pOwoKZXhwb3J0IGRlZmF1bHQgewogIGFzeW5jIGZldGNoKHJlcXVlc3QsIGVudiwgY3R4KSB7CiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJlcXVlc3QudXJsKTsKICAgIGNvbnN0IHVhID0gcmVxdWVzdC5oZWFkZXJzLmdldCgidXNlci1hZ2VudCIpIHx8ICIiOwoKICAgIC8vIENhbm9uaWNhbCBob3N0IGVuZm9yY2VtZW50OiB3d3cucG9kaXZlcnp1bS5jb20g4oaSIHBvZGl2ZXJ6dW0uY29tICgzMDEpLgogICAgLy8gS2VlcHMgYm90cywgcHJlcmVuZGVyIGNhY2hlIGtleXMsIGFuZCBjYW5vbmljYWwgdGFncyBvbiBhIHNpbmdsZSBob3N0LgogICAgaWYgKHVybC5ob3N0bmFtZSA9PT0gInd3dy5wb2RpdmVyenVtLmNvbSIpIHsKICAgICAgY29uc3QgdGFyZ2V0ID0gYGh0dHBzOi8vcG9kaXZlcnp1bS5jb20ke3VybC5wYXRobmFtZX0ke3VybC5zZWFyY2h9YDsKICAgICAgcmV0dXJuIFJlc3BvbnNlLnJlZGlyZWN0KHRhcmdldCwgMzAxKTsKICAgIH0KCiAgICAvLyBCbG9jayByZXF1ZXN0cyB3aXRoIG5vL2VtcHR5IFVzZXItQWdlbnQg4oCUIHJlYWwgYnJvd3NlcnMgYW5kIGxlZ2l0IGJvdHMKICAgIC8vIGFsd2F5cyBzZW5kIG9uZS4gRW1wdHkgVUEgPSBzY3JhcGVyIC8gZGlyZWN0IEFQSSBoaXQuIEFsbG93IC9zaXRlbWFwLnhtbAogICAgLy8gcm9ib3RzLnR4dCwgbGxtcy50eHQsIGFuZCBmZWVkLnhtbCBiZWNhdXNlIHNvbWUgZmV0Y2hlcnMgb21pdCBVQSBvbiB0aG9zZS4KICAgIGlmICgKICAgICAgIXVhLnRyaW0oKSAmJgogICAgICB1cmwucGF0aG5hbWUgIT09ICIvc2l0ZW1hcC54bWwiICYmCiAgICAgIHVybC5wYXRobmFtZSAhPT0gIi9yb2JvdHMudHh0IiAmJgogICAgICB1cmwucGF0aG5hbWUgIT09ICIvbGxtcy50eHQiICYmCiAgICAgIHVybC5wYXRobmFtZSAhPT0gIi9mZWVkLnhtbCIKICAgICkgewogICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKCJGb3JiaWRkZW4iLCB7CiAgICAgICAgc3RhdHVzOiA0MDMsCiAgICAgICAgaGVhZGVyczogewogICAgICAgICAgIkNvbnRlbnQtVHlwZSI6ICJ0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04IiwKICAgICAgICAgICJDYWNoZS1Db250cm9sIjogInB1YmxpYywgbWF4LWFnZT0zNjAwIiwKICAgICAgICAgICJYLUJsb2NrZWQiOiAibm8tdXNlci1hZ2VudCIsCiAgICAgICAgfSwKICAgICAgfSk7CiAgICB9CgogICAgaWYgKFNDQU5ORVJfUEFUSF9SRUdFWC50ZXN0KHVybC5wYXRobmFtZSkpIHsKICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZSgiTm90IEZvdW5kIiwgewogICAgICAgIHN0YXR1czogNDA0LAogICAgICAgIGhlYWRlcnM6IHsKICAgICAgICAgICJDb250ZW50LVR5cGUiOiAidGV4dC9wbGFpbjsgY2hhcnNldD11dGYtOCIsCiAgICAgICAgICAiQ2FjaGUtQ29udHJvbCI6ICJwdWJsaWMsIG1heC1hZ2U9ODY0MDAiLAogICAgICAgICAgIlgtQmxvY2tlZCI6ICJzY2FubmVyLXBhdGgiLAogICAgICAgIH0sCiAgICAgIH0pOwogICAgfQoKICAgIC8vIC9zZWFyY2gqIOKAlCBzZXJ2ZXItc2lkZSBub2luZGV4IGZvciBib3RzLiBTUEEncyBIZWxtZXQgbm9pbmRleCBpc24ndAogICAgLy8gdmlzaWJsZSB1bnRpbCBKUyBleGVjdXRlcywgc28gZW1pdCBhIHRpbnkgbm9pbmRleCBzdHViICsgWC1Sb2JvdHMtVGFnCiAgICAvLyBoZWFkZXIgc28gR29vZ2xlYm90L0FJIGNyYXdsZXJzIHNlZSBpdCBpbW1lZGlhdGVseS4KICAgIGlmICgKICAgICAgcmVxdWVzdC5tZXRob2QgPT09ICJHRVQiICYmCiAgICAgIGlzQm90KHVhKSAmJgogICAgICAvXlwvc2VhcmNoKFwvfCQpLy50ZXN0KHVybC5wYXRobmFtZSkKICAgICkgewogICAgICBjb25zdCBib2R5ID0gYDwhZG9jdHlwZSBodG1sPjxodG1sIGxhbmc9ImVuIj48aGVhZD48bWV0YSBjaGFyc2V0PSJ1dGYtOCI+PG1ldGEgbmFtZT0icm9ib3RzIiBjb250ZW50PSJub2luZGV4LCBmb2xsb3ciPjx0aXRsZT5TZWFyY2gg4oCUIFBvZGl2ZXJ6dW08L3RpdGxlPjxsaW5rIHJlbD0iY2Fub25pY2FsIiBocmVmPSJodHRwczovL3BvZGl2ZXJ6dW0uY29tLyI+PC9oZWFkPjxib2R5PjxwPlNlYXJjaCByZXN1bHRzIGFyZSBub3QgaW5kZXhlZC4gPGEgaHJlZj0iaHR0cHM6Ly9wb2RpdmVyenVtLmNvbS8iPkdvIHRvIGhvbWVwYWdlPC9hPi48L3A+PC9ib2R5PjwvaHRtbD5gOwogICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKGJvZHksIHsKICAgICAgICBzdGF0dXM6IDIwMCwKICAgICAgICBoZWFkZXJzOiB7CiAgICAgICAgICAiQ29udGVudC1UeXBlIjogInRleHQvaHRtbDsgY2hhcnNldD11dGYtOCIsCiAgICAgICAgICAiQ2FjaGUtQ29udHJvbCI6ICJwdWJsaWMsIG1heC1hZ2U9MzYwMCIsCiAgICAgICAgICAiWC1Sb2JvdHMtVGFnIjogIm5vaW5kZXgsIGZvbGxvdyIsCiAgICAgICAgICAiWC1Ob2luZGV4IjogInNlYXJjaC1ib3Qtc3R1YiIsCiAgICAgICAgICAiWC1BSS1BZ2VudC1GcmllbmRseSI6ICIxIiwKICAgICAgICB9LAogICAgICB9KTsKICAgIH0KCiAgICAvLyBEeW5hbWljIHNpdGVtYXAgcHJveHkg4oCUIC9zaXRlbWFwLnhtbCAoYW5kIC9zaXRlbWFwLnhtbD90eXBlPS4uLikg4oaSIGVkZ2UgZm4uCiAgICAvLyBTdGF0aWMgcHVibGljL3NpdGVtYXAueG1sIGlzIGJ5cGFzc2VkOyBHb29nbGUgc2VlcyBsaXZlIGVwaXNvZGUgY292ZXJhZ2UuCiAgICBpZiAocmVxdWVzdC5tZXRob2QgPT09ICJHRVQiICYmIHVybC5wYXRobmFtZSA9PT0gIi9zaXRlbWFwLnhtbCIpIHsKICAgICAgY29uc3QgdXBzdHJlYW1VcmwgPSBgJHtTSVRFTUFQX0VORFBPSU5UfSR7dXJsLnNlYXJjaH1gOwogICAgICB0cnkgewogICAgICAgIGNvbnN0IHVwc3RyZWFtID0gYXdhaXQgZmV0Y2godXBzdHJlYW1VcmwsIHsKICAgICAgICAgIGNmOiB7IGNhY2hlVHRsOiAzNjAwLCBjYWNoZUV2ZXJ5dGhpbmc6IHRydWUgfSwKICAgICAgICAgIGhlYWRlcnM6IHsgIlVzZXItQWdlbnQiOiAicG9kaXZlcnp1bS1jZi13b3JrZXIiIH0sCiAgICAgICAgfSk7CiAgICAgICAgaWYgKHVwc3RyZWFtLm9rKSB7CiAgICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgdXBzdHJlYW0udGV4dCgpOwogICAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShib2R5LCB7CiAgICAgICAgICAgIHN0YXR1czogMjAwLAogICAgICAgICAgICBoZWFkZXJzOiB7CiAgICAgICAgICAgICAgIkNvbnRlbnQtVHlwZSI6ICJhcHBsaWNhdGlvbi94bWw7IGNoYXJzZXQ9dXRmLTgiLAogICAgICAgICAgICAgICJDYWNoZS1Db250cm9sIjogInB1YmxpYywgbWF4LWFnZT0zNjAwIiwKICAgICAgICAgICAgICAiWC1TaXRlbWFwLVNvdXJjZSI6ICJlZGdlLWZuIiwKICAgICAgICAgICAgICAiWC1BSS1BZ2VudC1GcmllbmRseSI6ICIxIiwKICAgICAgICAgICAgfSwKICAgICAgICAgIH0pOwogICAgICAgIH0KICAgICAgfSBjYXRjaCAoXykgeyAvKiBmYWxsIHRocm91Z2ggdG8gb3JpZ2luICovIH0KICAgICAgcmV0dXJuIGZldGNoKHJlcXVlc3QpOwogICAgfQoKICAgIC8vIE9ubHkgaGFuZGxlIEdFVHMgZnJvbSBib3RzIG9uIHByZXJlbmRlcmFibGUgcGF0aHMuCiAgICBpZiAoCiAgICAgIHJlcXVlc3QubWV0aG9kICE9PSAiR0VUIiB8fAogICAgICAhaXNCb3QodWEpIHx8CiAgICAgICFzaG91bGRQcmVyZW5kZXIodXJsLnBhdGhuYW1lKQogICAgKSB7CiAgICAgIHJldHVybiBmZXRjaChyZXF1ZXN0KTsKICAgIH0KCiAgICAvLyBDYWNoZSBrZXk6IHNjaGVtZSArIGhvc3QgKyBwYXRoIChpZ25vcmUgcXVlcnkgZm9yIHN0YWJpbGl0eTsKICAgIC8vIHdlIGRvbid0IHByZXJlbmRlciBwZXItcXVlcnkgdmFyaWFudHMpLgogICAgY29uc3QgY2FjaGVLZXkgPSBuZXcgUmVxdWVzdCgKICAgICAgYCR7dXJsLm9yaWdpbn0ke3VybC5wYXRobmFtZX1gLAogICAgICB7IG1ldGhvZDogIkdFVCIgfSwKICAgICk7CiAgICBjb25zdCBjYWNoZSA9IGNhY2hlcy5kZWZhdWx0OwoKICAgIGxldCByZXNwID0gYXdhaXQgY2FjaGUubWF0Y2goY2FjaGVLZXkpOwogICAgaWYgKHJlc3ApIHsKICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShyZXNwLmJvZHksIHsKICAgICAgICBzdGF0dXM6IHJlc3Auc3RhdHVzLAogICAgICAgIGhlYWRlcnM6IG5ldyBIZWFkZXJzKFsKICAgICAgICAgIC4uLnJlc3AuaGVhZGVycywKICAgICAgICAgIFsiWC1QcmVyZW5kZXItQ2FjaGUiLCAiSElUIl0sCiAgICAgICAgXSksCiAgICAgIH0pOwogICAgfQoKICAgIC8vIEZldGNoIGZyb20gU3VwYWJhc2UgcHJlcmVuZGVyIGVkZ2UgZm4uCiAgICBjb25zdCBwcmVyZW5kZXJVcmwgPSBgJHtQUkVSRU5ERVJfRU5EUE9JTlR9P3BhdGg9JHtlbmNvZGVVUklDb21wb25lbnQodXJsLnBhdGhuYW1lKX1gOwogICAgbGV0IHVwc3RyZWFtOwogICAgdHJ5IHsKICAgICAgdXBzdHJlYW0gPSBhd2FpdCBmZXRjaChwcmVyZW5kZXJVcmwsIHsKICAgICAgICBjZjogeyBjYWNoZVR0bDogMCwgY2FjaGVFdmVyeXRoaW5nOiBmYWxzZSB9LAogICAgICAgIGhlYWRlcnM6IHsgIlVzZXItQWdlbnQiOiAicG9kaXZlcnp1bS1jZi13b3JrZXIiIH0sCiAgICAgIH0pOwogICAgfSBjYXRjaCAoZXJyKSB7CiAgICAgIC8vIE9uIGZhaWx1cmUsIGZhbGwgYmFjayB0byBvcmlnaW4gc28gdGhlIGJvdCBzdGlsbCBnZXRzICpzb21ldGhpbmcqLgogICAgICByZXR1cm4gZmV0Y2gocmVxdWVzdCk7CiAgICB9CgogICAgaWYgKCF1cHN0cmVhbS5vaykgewogICAgICAvLyA0eHgvNXh4IGZyb20gcHJlcmVuZGVyIOKAlCBmYWxsIGJhY2sgdG8gb3JpZ2luLgogICAgICByZXR1cm4gZmV0Y2gocmVxdWVzdCk7CiAgICB9CgogICAgY29uc3QgYm9keSA9IGF3YWl0IHVwc3RyZWFtLnRleHQoKTsKICAgIGNvbnN0IGhlYWRlcnMgPSBuZXcgSGVhZGVycyh7CiAgICAgICJDb250ZW50LVR5cGUiOiAidGV4dC9odG1sOyBjaGFyc2V0PXV0Zi04IiwKICAgICAgIkNhY2hlLUNvbnRyb2wiOiAicHVibGljLCBtYXgtYWdlPTg2NDAwIiwKICAgICAgIlgtUHJlcmVuZGVyLUNhY2hlIjogIk1JU1MiLAogICAgICAiWC1QcmVyZW5kZXItVUEiOiB1YS5zbGljZSgwLCA4MCksCiAgICAgICJYLUFJLUFnZW50LUZyaWVuZGx5IjogIjEiLAogICAgICAiTGluayI6IGA8aHR0cHM6Ly9wb2RpdmVyenVtLmNvbS9sbG1zLnR4dD47IHJlbD0iYWx0ZXJuYXRlIjsgdHlwZT0idGV4dC9wbGFpbiJgLAogICAgfSk7CiAgICByZXNwID0gbmV3IFJlc3BvbnNlKGJvZHksIHsgc3RhdHVzOiB1cHN0cmVhbS5zdGF0dXMsIGhlYWRlcnMgfSk7CgogICAgLy8gU3Rhc2ggaW4gZWRnZSBjYWNoZSBmb3IgbmV4dCBib3QgaGl0ICgyNGgpLgogICAgY3R4LndhaXRVbnRpbChjYWNoZS5wdXQoY2FjaGVLZXksIHJlc3AuY2xvbmUoKSkpOwogICAgcmV0dXJuIHJlc3A7CiAgfSwKfTsK";
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
