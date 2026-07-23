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

const WORKER_SRC_B64 = "LyoqCiAqIFBvZGl2ZXJ6dW0gYm90IHByZXJlbmRlciBXb3JrZXIKICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCiAqIC0gRGV0ZWN0cyBBSS9TRU8gY3Jhd2xlciBVc2VyLUFnZW50cwogKiAtIEZvciBtYXRjaGVkIHJvdXRlczogc2VydmVzIHByZXJlbmRlcmVkIEhUTUwgZnJvbSBTdXBhYmFzZSBlZGdlIGZuCiAqICAgKGNhY2hlZCAyNGggdmlhIENhY2hlIEFQSSkKICogLSBFdmVyeXRoaW5nIGVsc2U6IHBhc3N0aHJvdWdoIHRvIExvdmFibGUgb3JpZ2luCiAqCiAqIEJpbmQgdGhpcyBXb3JrZXIgdG86ICBwb2RpdmVyenVtLmNvbS8qICBhbmQgIHd3dy5wb2RpdmVyenVtLmNvbS8qCiAqCiAqIE5vIGVudmlyb25tZW50IHZhcmlhYmxlcyByZXF1aXJlZCDigJQgb3JpZ2luIGFuZCBwcmVyZW5kZXIgVVJMIGFyZSBjb25zdGFudHMuCiAqLwoKY29uc3QgUFJFUkVOREVSX0VORFBPSU5UID0KICAiaHR0cHM6Ly9pcXprYXlvcXFhZ293dnhlYXBoZS5zdXBhYmFzZS5jby9mdW5jdGlvbnMvdjEvcHJlcmVuZGVyIjsKY29uc3QgU0lURU1BUF9FTkRQT0lOVCA9CiAgImh0dHBzOi8vaXF6a2F5b3FxYWdvd3Z4ZWFwaGUuc3VwYWJhc2UuY28vZnVuY3Rpb25zL3YxL3NpdGVtYXAiOwoKLy8gTG92YWJsZSBvcmlnaW4gaG9zdCAocHJveGllZCB2aWEgQ2xvdWRmbGFyZSkuIFdvcmtlcnMgcm91dGUgcnVucyBCRUZPUkUKLy8gdGhlIHByb3h5IHJldHVybnMsIHNvIHdlIGp1c3QgYGZldGNoKHJlcXVlc3QpYCB0byBwYXNzdGhyb3VnaC4KLy8KLy8gQm90IFVBIGRldGVjdGlvbiDigJQgbXVzdCBiZSBsb3dlcmNhc2VkIGJlZm9yZSBtYXRjaGluZy4KY29uc3QgQk9UX1VBUyA9IFsKICAvLyBBSSBjcmF3bGVycyAodGhpcyBpcyB0aGUgbWFpbiByZWFzb24gd2UncmUgZG9pbmcgdGhpcykKICAiZ3B0Ym90IiwKICAib2FpLXNlYXJjaGJvdCIsCiAgImNoYXRncHQtdXNlciIsCiAgImNsYXVkZS13ZWIiLAogICJjbGF1ZGVib3QiLAogICJjbGF1ZGUtdXNlciIsCiAgImNsYXVkZS1zZWFyY2hib3QiLAogICJhbnRocm9waWMtYWkiLAogICJwZXJwbGV4aXR5Ym90IiwKICAicGVycGxleGl0eS11c2VyIiwKICAiZ29vZ2xlLWV4dGVuZGVkIiwKICAieW91Ym90IiwKICAiY2Nib3QiLCAvLyBDb21tb24gQ3Jhd2wsIHVzZWQgYXMgdHJhaW5pbmcgZGF0YQogICJjb2hlcmUtYWkiLAogICJkaWZmYm90IiwKICAiYnl0ZXNwaWRlciIsCiAgImFtYXpvbmJvdCIsCiAgImFwcGxlYm90LWV4dGVuZGVkIiwKICAvLyBDbGFzc2ljIFNFTyArIHNvY2lhbCBwcmV2aWV3cyAoaGVscHMgd2hlbiBKUyBpc24ndCBleGVjdXRlZCkKICAiZ29vZ2xlYm90IiwKICAiYmluZ2JvdCIsCiAgImR1Y2tkdWNrYm90IiwKICAieWFuZGV4Ym90IiwKICAiYmFpZHVzcGlkZXIiLAogICJmYWNlYm9va2V4dGVybmFsaGl0IiwKICAiZmFjZWJvb2tib3QiLAogICJ0d2l0dGVyYm90IiwKICAibGlua2VkaW5ib3QiLAogICJzbGFja2JvdCIsCiAgImRpc2NvcmRib3QiLAogICJ0ZWxlZ3JhbWJvdCIsCiAgIndoYXRzYXBwIiwKICAiZW1iZWRseSIsCiAgInBpbnRlcmVzdCIsCiAgInJlZGRpdGJvdCIsCiAgImluc3RhZ3JhbSIsCiAgImlmcmFtZWx5IiwKICAic2t5cGV1cmlwcmV2aWV3IiwKICAidmliZXIiLAogICJzbmFwY2hhdCIsCiAgInR1bWJsciIsCiAgInZrc2hhcmUiLAogICJhcHBsZWJvdCIsCiAgImdvb2dsZS1wYWdlcmVuZGVyZXIiLApdOwoKY29uc3QgR0VORVJJQ19CT1RfUkUgPQogIC8oYm90fGNyYXdsZXJ8c3BpZGVyfGNyYXdsfHByZXZpZXd8ZmV0Y2h8aHR0cGNsaWVudHxodHRwLWNsaWVudHxweXRob24tcmVxdWVzdHN8bGlid3d3fHdnZXR8Y3VybHxnby1odHRwfGphdmFcL3xva2h0dHB8YXhpb3N8bm9kZS1mZXRjaHx1bmRpY2l8cnVieXxodHRwaWV8c2NyYXB5fGhlYWRsZXNzY2hyb21lfHBoYW50b21qc3xwdXBwZXRlZXJ8cGxheXdyaWdodCkvaTsKCmZ1bmN0aW9uIGlzQm90KHVhKSB7CiAgaWYgKCF1YSkgcmV0dXJuIGZhbHNlOwogIGNvbnN0IHMgPSB1YS50b0xvd2VyQ2FzZSgpOwogIHJldHVybiBCT1RfVUFTLnNvbWUoKGIpID0+IHMuaW5jbHVkZXMoYikpIHx8IEdFTkVSSUNfQk9UX1JFLnRlc3Qocyk7Cn0KCi8vIFJvdXRlcyB3ZSBrbm93IGhvdyB0byBwcmVyZW5kZXIuIEFueXRoaW5nIGVsc2UgZmFsbHMgYmFjayB0byBvcmlnaW4uCmZ1bmN0aW9uIHNob3VsZFByZXJlbmRlcihwYXRobmFtZSkgewogIGlmIChwYXRobmFtZSA9PT0gIi8iIHx8IHBhdGhuYW1lID09PSAiIikgcmV0dXJuIHRydWU7CiAgaWYgKC9eXC8oY2F0ZWdvcmllc3x0b3BpY3N8cGVvcGxlfGNvbXBhbmllc3xkYWlseXx0b3BsaXN0fHJhbmtpbmdzfG5ld3xhYm91dHxtZXRob2RvbG9neXxjb250YWN0fHByaXZhY3l8dGVybXMpXC8/JC8udGVzdChwYXRobmFtZSkpIHJldHVybiB0cnVlOwogIC8vIC9wb2RjYXN0LzpzbHVnICBvciAgL3BvZGNhc3QvOnNsdWcvOmVwaXNvZGUKICBpZiAoL15cL3BvZGNhc3RcL1teL10rKFwvW14vXSspP1wvPyQvLnRlc3QocGF0aG5hbWUpKSByZXR1cm4gdHJ1ZTsKICBpZiAoL15cL2NhdGVnb3J5XC9bXi9dK1wvPyQvLnRlc3QocGF0aG5hbWUpKSByZXR1cm4gdHJ1ZTsKICBpZiAoL15cLyh0b3BpY3xwZXJzb258Y29tcGFueXx0aWNrZXJ8aW5ncmVkaWVudClcL1teL10rXC8/JC8udGVzdChwYXRobmFtZSkpIHJldHVybiB0cnVlOwogIHJldHVybiBmYWxzZTsKfQoKZnVuY3Rpb24gc2hvdWxkU2VydmVTdGF0aWNFbmdsaXNoKHBhdGhuYW1lKSB7CiAgaWYgKHBhdGhuYW1lID09PSAiLyIgfHwgcGF0aG5hbWUgPT09ICIiKSByZXR1cm4gdHJ1ZTsKICByZXR1cm4gL15cLyhjYXRlZ29yaWVzfHRvcGljc3xwZW9wbGV8Y29tcGFuaWVzfGRhaWx5fHRvcGxpc3R8cmFua2luZ3N8bmV3fGFib3V0fG1ldGhvZG9sb2d5fGNvbnRhY3R8cHJpdmFjeXx0ZXJtcylcLz8kLy50ZXN0KHBhdGhuYW1lKTsKfQoKY29uc3QgTEFOR1VBR0VfTEVBS19SRSA9IG5ldyBSZWdFeHAoCiAgIltcXHUwMGUxXFx1MDBlOVxcdTAwZWRcXHUwMGYzXFx1MDBmNlxcdTAxNTFcXHUwMGZhXFx1MDBmY1xcdTAxNzFcXHUwMGMxXFx1MDBjOVxcdTAwY2RcXHUwMGQzXFx1MDBkNlxcdTAxNTBcXHUwMGRhXFx1MDBkY1xcdTAxNzBdfFxcYigiICsKICAgIFsKICAgICAgIlxceDZkXFx4NjFcXHg2N1xceDc5XFx4NjFcXHg3MiIsCiAgICAgICJcXHg2YlxceDY1XFx4NzJcXHg2NVxceDczXFx4NmYiLAogICAgICAiXFx4NjFcXHg2YVxceDYxXFx4NmVcXHg2Y1xceDZmIiwKICAgICAgIlxceDY2XFx4NjVcXHg2Y1xceDY2XFx4NjVcXHg2NFxceDY1XFx4N2FcXHg2ZiIsCiAgICBdLmpvaW4oInwiKSArCiAgICAiKVxcYiIsCiAgImkiLAopOwoKZnVuY3Rpb24gaGFzQ29tTGFuZ3VhZ2VMZWFrKGh0bWwpIHsKICBjb25zdCBzID0gU3RyaW5nKGh0bWwgfHwgIiIpLnRvTG93ZXJDYXNlKCk7CiAgcmV0dXJuICgKICAgIHMuaW5jbHVkZXMoInBvZGl2ZXJ6dW0iICsgIi5odSIpIHx8CiAgICBzLmluY2x1ZGVzKCJsYW5nPSIgKyAiXCJoIiArICJ1XCIiKSB8fAogICAgcy5pbmNsdWRlcygiaCIgKyAidS1oIiArICJ1IikgfHwKICAgIExBTkdVQUdFX0xFQUtfUkUudGVzdChodG1sKQogICk7Cn0KCmZ1bmN0aW9uIGVuZ2xpc2hGYWxsYmFjayhwYXRobmFtZSkgewogIGNvbnN0IGNhbm9uaWNhbCA9IGBodHRwczovL3BvZGl2ZXJ6dW0uY29tJHtwYXRobmFtZSA9PT0gIi8iID8gIi8iIDogcGF0aG5hbWV9YDsKICBjb25zdCB0aXRsZSA9IHBhdGhuYW1lID09PSAiL3RvcGxpc3QiCiAgICA/ICJQb2RjYXN0IFRvcGxpc3QgLSBQb2RpdmVyenVtIgogICAgOiAiUG9kaXZlcnp1bSAtIEZpbmQgaXQuIEhlYXIgaXQuIjsKICBjb25zdCBkZXNjcmlwdGlvbiA9IHBhdGhuYW1lID09PSAiL3RvcGxpc3QiCiAgICA/ICJDcm9zcy1wbGF0Zm9ybSBwb2RjYXN0IHJhbmtpbmdzIGJ1aWx0IGZyb20gQXBwbGUsIFNwb3RpZnkgYW5kIFlvdVR1YmUgY2hhcnQgc2lnbmFscy4iCiAgICA6ICJTZWFyY2ggcG9kY2FzdCBlcGlzb2RlcyBieSB3aGF0IHRoZXkgYWN0dWFsbHkgZGlzY3VzczogdG9waWNzLCBwZW9wbGUsIGNvbXBhbmllcywgdGlja2VycywgdGVjaG5vbG9naWVzIGFuZCBpZGVhcy4iOwogIHJldHVybiBgPCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9IlVURi04IiAvPgo8bWV0YSBuYW1lPSJ2aWV3cG9ydCIgY29udGVudD0id2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEuMCIgLz4KPHRpdGxlPiR7dGl0bGV9PC90aXRsZT4KPG1ldGEgbmFtZT0iZGVzY3JpcHRpb24iIGNvbnRlbnQ9IiR7ZGVzY3JpcHRpb259IiAvPgo8bWV0YSBuYW1lPSJyb2JvdHMiIGNvbnRlbnQ9ImluZGV4LCBmb2xsb3csIG1heC1zbmlwcGV0Oi0xLCBtYXgtaW1hZ2UtcHJldmlldzpsYXJnZSwgbWF4LXZpZGVvLXByZXZpZXc6LTEiIC8+CjxsaW5rIHJlbD0iY2Fub25pY2FsIiBocmVmPSIke2Nhbm9uaWNhbH0iIC8+CjxsaW5rIHJlbD0ic2l0ZW1hcCIgdHlwZT0iYXBwbGljYXRpb24veG1sIiBocmVmPSJodHRwczovL3BvZGl2ZXJ6dW0uY29tL3NpdGVtYXAueG1sIiAvPgo8bGluayByZWw9ImFsdGVybmF0ZSIgdHlwZT0idGV4dC9wbGFpbiIgaHJlZj0iaHR0cHM6Ly9wb2RpdmVyenVtLmNvbS9sbG1zLnR4dCIgdGl0bGU9IkxMTXMudHh0IiAvPgo8bWV0YSBwcm9wZXJ0eT0ib2c6dHlwZSIgY29udGVudD0id2Vic2l0ZSIgLz4KPG1ldGEgcHJvcGVydHk9Im9nOnRpdGxlIiBjb250ZW50PSIke3RpdGxlfSIgLz4KPG1ldGEgcHJvcGVydHk9Im9nOmRlc2NyaXB0aW9uIiBjb250ZW50PSIke2Rlc2NyaXB0aW9ufSIgLz4KPG1ldGEgcHJvcGVydHk9Im9nOnVybCIgY29udGVudD0iJHtjYW5vbmljYWx9IiAvPgo8L2hlYWQ+Cjxib2R5Pgo8bWFpbj4KPGgxPlBvZGl2ZXJ6dW08L2gxPgo8cD4ke2Rlc2NyaXB0aW9ufTwvcD4KPG5hdj4KPGEgaHJlZj0iaHR0cHM6Ly9wb2RpdmVyenVtLmNvbS8iPkhvbWU8L2E+CjxhIGhyZWY9Imh0dHBzOi8vcG9kaXZlcnp1bS5jb20vc2VhcmNoIj5TZWFyY2g8L2E+CjxhIGhyZWY9Imh0dHBzOi8vcG9kaXZlcnp1bS5jb20vY2F0ZWdvcmllcyI+Q2F0ZWdvcmllczwvYT4KPGEgaHJlZj0iaHR0cHM6Ly9wb2RpdmVyenVtLmNvbS90b3BsaXN0Ij5Ub3BsaXN0PC9hPgo8YSBocmVmPSJodHRwczovL3BvZGl2ZXJ6dW0uY29tL3RvcGljcyI+VG9waWNzPC9hPgo8L25hdj4KPC9tYWluPgo8L2JvZHk+CjwvaHRtbD5gOwp9CgovLyBIYXJkLTQwNCB0aGVzZSBzY2FubmVyIHBhdGhzIHJlZ2FyZGxlc3Mgb2YgVUEuIENvbnNlcnZhdGl2ZSDigJQgbm8gYXBwIHJvdXRlcyBtYXRjaC4KY29uc3QgU0NBTk5FUl9QQVRIX1JFR0VYID0KICAvXlwvKHdwLWFkbWlufHdwLWxvZ2lufHdwLWNvbnRlbnR8d3AtaW5jbHVkZXN8d3AtanNvbnx4bWxycGNcLnBocHxcLmVudnxcLmdpdHxcLmF3c3xcLnNzaHxcLmRvY2tlcnxcLnZzY29kZXxcLmlkZWF8cGhwbXlhZG1pbnxwbWF8bXlzcWx8YWRtaW5lcnxjb25maWdcLnBocHxjb25maWd1cmF0aW9uXC5waHB8YmFja3VwfGJhY2t1cHN8ZHVtcHxkdW1wc3xcLmJha3xcLnNxbHxcLnppcHxcLnRhcnxcLnRnenxjZ2ktYmlufGNnaXxvd2F8YXV0b2Rpc2NvdmVyfGVjcHxleGNoYW5nZXxib2Fmb3JtfEhOQVAxfGh1ZHNvbnxqZW5raW5zfHNvbHJ8am14LWNvbnNvbGV8bWFuYWdlclwvaHRtbHxhY3R1YXRvcnxjb25zb2xlfHRlbGVzY29wZXxkZWJ1Z3xzZXJ2ZXItc3RhdHVzfHNlcnZlci1pbmZvfGFwaVwvbG9naW58YXBpXC92MVwvbG9naW4pKFwvfCR8XC4pL2k7CgpleHBvcnQgZGVmYXVsdCB7CiAgYXN5bmMgZmV0Y2gocmVxdWVzdCwgZW52LCBjdHgpIHsKICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmVxdWVzdC51cmwpOwogICAgY29uc3QgdWEgPSByZXF1ZXN0LmhlYWRlcnMuZ2V0KCJ1c2VyLWFnZW50IikgfHwgIiI7CgogICAgLy8gQ2Fub25pY2FsIGhvc3QgZW5mb3JjZW1lbnQ6IHd3dy5wb2RpdmVyenVtLmNvbSDihpIgcG9kaXZlcnp1bS5jb20gKDMwMSkuCiAgICAvLyBLZWVwcyBib3RzLCBwcmVyZW5kZXIgY2FjaGUga2V5cywgYW5kIGNhbm9uaWNhbCB0YWdzIG9uIGEgc2luZ2xlIGhvc3QuCiAgICBpZiAodXJsLmhvc3RuYW1lID09PSAid3d3LnBvZGl2ZXJ6dW0uY29tIikgewogICAgICBjb25zdCB0YXJnZXQgPSBgaHR0cHM6Ly9wb2RpdmVyenVtLmNvbSR7dXJsLnBhdGhuYW1lfSR7dXJsLnNlYXJjaH1gOwogICAgICByZXR1cm4gUmVzcG9uc2UucmVkaXJlY3QodGFyZ2V0LCAzMDEpOwogICAgfQoKICAgIC8vIEJsb2NrIHJlcXVlc3RzIHdpdGggbm8vZW1wdHkgVXNlci1BZ2VudCDigJQgcmVhbCBicm93c2VycyBhbmQgbGVnaXQgYm90cwogICAgLy8gYWx3YXlzIHNlbmQgb25lLiBFbXB0eSBVQSA9IHNjcmFwZXIgLyBkaXJlY3QgQVBJIGhpdC4gQWxsb3cgL3NpdGVtYXAueG1sCiAgICAvLyByb2JvdHMudHh0LCBsbG1zLnR4dCwgYW5kIGZlZWQueG1sIGJlY2F1c2Ugc29tZSBmZXRjaGVycyBvbWl0IFVBIG9uIHRob3NlLgogICAgaWYgKAogICAgICAhdWEudHJpbSgpICYmCiAgICAgIHVybC5wYXRobmFtZSAhPT0gIi9zaXRlbWFwLnhtbCIgJiYKICAgICAgdXJsLnBhdGhuYW1lICE9PSAiL3JvYm90cy50eHQiICYmCiAgICAgIHVybC5wYXRobmFtZSAhPT0gIi9sbG1zLnR4dCIgJiYKICAgICAgdXJsLnBhdGhuYW1lICE9PSAiL2ZlZWQueG1sIgogICAgKSB7CiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoIkZvcmJpZGRlbiIsIHsKICAgICAgICBzdGF0dXM6IDQwMywKICAgICAgICBoZWFkZXJzOiB7CiAgICAgICAgICAiQ29udGVudC1UeXBlIjogInRleHQvcGxhaW47IGNoYXJzZXQ9dXRmLTgiLAogICAgICAgICAgIkNhY2hlLUNvbnRyb2wiOiAicHVibGljLCBtYXgtYWdlPTM2MDAiLAogICAgICAgICAgIlgtQmxvY2tlZCI6ICJuby11c2VyLWFnZW50IiwKICAgICAgICB9LAogICAgICB9KTsKICAgIH0KCiAgICBpZiAoU0NBTk5FUl9QQVRIX1JFR0VYLnRlc3QodXJsLnBhdGhuYW1lKSkgewogICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKCJOb3QgRm91bmQiLCB7CiAgICAgICAgc3RhdHVzOiA0MDQsCiAgICAgICAgaGVhZGVyczogewogICAgICAgICAgIkNvbnRlbnQtVHlwZSI6ICJ0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04IiwKICAgICAgICAgICJDYWNoZS1Db250cm9sIjogInB1YmxpYywgbWF4LWFnZT04NjQwMCIsCiAgICAgICAgICAiWC1CbG9ja2VkIjogInNjYW5uZXItcGF0aCIsCiAgICAgICAgfSwKICAgICAgfSk7CiAgICB9CgogICAgLy8gL3NlYXJjaCog4oCUIHNlcnZlci1zaWRlIG5vaW5kZXggZm9yIGJvdHMuIFNQQSdzIEhlbG1ldCBub2luZGV4IGlzbid0CiAgICAvLyB2aXNpYmxlIHVudGlsIEpTIGV4ZWN1dGVzLCBzbyBlbWl0IGEgdGlueSBub2luZGV4IHN0dWIgKyBYLVJvYm90cy1UYWcKICAgIC8vIGhlYWRlciBzbyBHb29nbGVib3QvQUkgY3Jhd2xlcnMgc2VlIGl0IGltbWVkaWF0ZWx5LgogICAgaWYgKAogICAgICByZXF1ZXN0Lm1ldGhvZCA9PT0gIkdFVCIgJiYKICAgICAgaXNCb3QodWEpICYmCiAgICAgIC9eXC9zZWFyY2goXC98JCkvLnRlc3QodXJsLnBhdGhuYW1lKQogICAgKSB7CiAgICAgIGNvbnN0IGJvZHkgPSBgPCFkb2N0eXBlIGh0bWw+PGh0bWwgbGFuZz0iZW4iPjxoZWFkPjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij48bWV0YSBuYW1lPSJyb2JvdHMiIGNvbnRlbnQ9Im5vaW5kZXgsIGZvbGxvdyI+PHRpdGxlPlNlYXJjaCDigJQgUG9kaXZlcnp1bTwvdGl0bGU+PGxpbmsgcmVsPSJjYW5vbmljYWwiIGhyZWY9Imh0dHBzOi8vcG9kaXZlcnp1bS5jb20vIj48L2hlYWQ+PGJvZHk+PHA+U2VhcmNoIHJlc3VsdHMgYXJlIG5vdCBpbmRleGVkLiA8YSBocmVmPSJodHRwczovL3BvZGl2ZXJ6dW0uY29tLyI+R28gdG8gaG9tZXBhZ2U8L2E+LjwvcD48L2JvZHk+PC9odG1sPmA7CiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoYm9keSwgewogICAgICAgIHN0YXR1czogMjAwLAogICAgICAgIGhlYWRlcnM6IHsKICAgICAgICAgICJDb250ZW50LVR5cGUiOiAidGV4dC9odG1sOyBjaGFyc2V0PXV0Zi04IiwKICAgICAgICAgICJDYWNoZS1Db250cm9sIjogInB1YmxpYywgbWF4LWFnZT0zNjAwIiwKICAgICAgICAgICJYLVJvYm90cy1UYWciOiAibm9pbmRleCwgZm9sbG93IiwKICAgICAgICAgICJYLU5vaW5kZXgiOiAic2VhcmNoLWJvdC1zdHViIiwKICAgICAgICAgICJYLUFJLUFnZW50LUZyaWVuZGx5IjogIjEiLAogICAgICAgIH0sCiAgICAgIH0pOwogICAgfQoKICAgIC8vIER5bmFtaWMgc2l0ZW1hcCBwcm94eSDigJQgL3NpdGVtYXAueG1sIChhbmQgL3NpdGVtYXAueG1sP3R5cGU9Li4uKSDihpIgZWRnZSBmbi4KICAgIC8vIFN0YXRpYyBwdWJsaWMvc2l0ZW1hcC54bWwgaXMgYnlwYXNzZWQ7IEdvb2dsZSBzZWVzIGxpdmUgZXBpc29kZSBjb3ZlcmFnZS4KICAgIGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gIkdFVCIgJiYgdXJsLnBhdGhuYW1lID09PSAiL3NpdGVtYXAueG1sIikgewogICAgICBjb25zdCB1cHN0cmVhbVVybCA9IGAke1NJVEVNQVBfRU5EUE9JTlR9JHt1cmwuc2VhcmNofWA7CiAgICAgIHRyeSB7CiAgICAgICAgY29uc3QgdXBzdHJlYW0gPSBhd2FpdCBmZXRjaCh1cHN0cmVhbVVybCwgewogICAgICAgICAgY2Y6IHsgY2FjaGVUdGw6IDM2MDAsIGNhY2hlRXZlcnl0aGluZzogdHJ1ZSB9LAogICAgICAgICAgaGVhZGVyczogeyAiVXNlci1BZ2VudCI6ICJwb2RpdmVyenVtLWNmLXdvcmtlciIgfSwKICAgICAgICB9KTsKICAgICAgICBpZiAodXBzdHJlYW0ub2spIHsKICAgICAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCB1cHN0cmVhbS50ZXh0KCk7CiAgICAgICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKGJvZHksIHsKICAgICAgICAgICAgc3RhdHVzOiAyMDAsCiAgICAgICAgICAgIGhlYWRlcnM6IHsKICAgICAgICAgICAgICAiQ29udGVudC1UeXBlIjogImFwcGxpY2F0aW9uL3htbDsgY2hhcnNldD11dGYtOCIsCiAgICAgICAgICAgICAgIkNhY2hlLUNvbnRyb2wiOiAicHVibGljLCBtYXgtYWdlPTM2MDAiLAogICAgICAgICAgICAgICJYLVNpdGVtYXAtU291cmNlIjogImVkZ2UtZm4iLAogICAgICAgICAgICAgICJYLUFJLUFnZW50LUZyaWVuZGx5IjogIjEiLAogICAgICAgICAgICB9LAogICAgICAgICAgfSk7CiAgICAgICAgfQogICAgICB9IGNhdGNoIChfKSB7IC8qIGZhbGwgdGhyb3VnaCB0byBvcmlnaW4gKi8gfQogICAgICByZXR1cm4gZmV0Y2gocmVxdWVzdCk7CiAgICB9CgogICAgLy8gT25seSBoYW5kbGUgR0VUcyBmcm9tIGJvdHMgb24gcHJlcmVuZGVyYWJsZSBwYXRocy4KICAgIGlmICgKICAgICAgcmVxdWVzdC5tZXRob2QgIT09ICJHRVQiIHx8CiAgICAgICFpc0JvdCh1YSkgfHwKICAgICAgIXNob3VsZFByZXJlbmRlcih1cmwucGF0aG5hbWUpCiAgICApIHsKICAgICAgcmV0dXJuIGZldGNoKHJlcXVlc3QpOwogICAgfQoKICAgIC8vIENhY2hlIGtleTogc2NoZW1lICsgaG9zdCArIHBhdGggKGlnbm9yZSBxdWVyeSBmb3Igc3RhYmlsaXR5OwogICAgLy8gd2UgZG9uJ3QgcHJlcmVuZGVyIHBlci1xdWVyeSB2YXJpYW50cykuCiAgICBjb25zdCBjYWNoZUtleSA9IG5ldyBSZXF1ZXN0KAogICAgICBgJHt1cmwub3JpZ2lufSR7dXJsLnBhdGhuYW1lfWAsCiAgICAgIHsgbWV0aG9kOiAiR0VUIiB9LAogICAgKTsKICAgIGNvbnN0IGNhY2hlID0gY2FjaGVzLmRlZmF1bHQ7CgogICAgLy8gRW1lcmdlbmN5IGNvbnRhaW5tZW50IGZvciB0aGUgLmNvbSBzdXJmYWNlOiB0aGVzZSBwYWdlcyBhcmUgdG9vIHZpc2libGUKICAgIC8vIHRvIHJpc2sgc3RhbGUgdXBzdHJlYW0gcHJlcmVuZGVyIEhUTUwgb3Igb2xkIHNvY2lhbC1wcmV2aWV3IGNhY2hlLgogICAgaWYgKHNob3VsZFNlcnZlU3RhdGljRW5nbGlzaCh1cmwucGF0aG5hbWUpKSB7CiAgICAgIGNvbnN0IGZhbGxiYWNrID0gbmV3IFJlc3BvbnNlKGVuZ2xpc2hGYWxsYmFjayh1cmwucGF0aG5hbWUpLCB7CiAgICAgICAgc3RhdHVzOiAyMDAsCiAgICAgICAgaGVhZGVyczogewogICAgICAgICAgIkNvbnRlbnQtVHlwZSI6ICJ0ZXh0L2h0bWw7IGNoYXJzZXQ9dXRmLTgiLAogICAgICAgICAgIkNhY2hlLUNvbnRyb2wiOiAicHVibGljLCBtYXgtYWdlPTMwMCwgcy1tYXhhZ2U9MzAwIiwKICAgICAgICAgICJYLVByZXJlbmRlci1TdGF0aWMtRW5nbGlzaCI6ICIxIiwKICAgICAgICAgICJYLUFJLUFnZW50LUZyaWVuZGx5IjogIjEiLAogICAgICAgICAgIkxpbmsiOiBgPGh0dHBzOi8vcG9kaXZlcnp1bS5jb20vbGxtcy50eHQ+OyByZWw9ImFsdGVybmF0ZSI7IHR5cGU9InRleHQvcGxhaW4iYCwKICAgICAgICB9LAogICAgICB9KTsKICAgICAgY3R4LndhaXRVbnRpbChjYWNoZS5wdXQoY2FjaGVLZXksIGZhbGxiYWNrLmNsb25lKCkpKTsKICAgICAgcmV0dXJuIGZhbGxiYWNrOwogICAgfQoKICAgIGxldCByZXNwID0gYXdhaXQgY2FjaGUubWF0Y2goY2FjaGVLZXkpOwogICAgaWYgKHJlc3ApIHsKICAgICAgY29uc3QgY2FjaGVkQm9keSA9IGF3YWl0IHJlc3AuY2xvbmUoKS50ZXh0KCk7CiAgICAgIGlmIChoYXNDb21MYW5ndWFnZUxlYWsoY2FjaGVkQm9keSkpIHsKICAgICAgICBjb25zdCBmYWxsYmFjayA9IG5ldyBSZXNwb25zZShlbmdsaXNoRmFsbGJhY2sodXJsLnBhdGhuYW1lKSwgewogICAgICAgICAgc3RhdHVzOiAyMDAsCiAgICAgICAgICBoZWFkZXJzOiB7CiAgICAgICAgICAgICJDb250ZW50LVR5cGUiOiAidGV4dC9odG1sOyBjaGFyc2V0PXV0Zi04IiwKICAgICAgICAgICAgIkNhY2hlLUNvbnRyb2wiOiAicHVibGljLCBtYXgtYWdlPTM2MDAiLAogICAgICAgICAgICAiWC1QcmVyZW5kZXItQ2FjaGUiOiAiSElULURJU0NBUkRFRCIsCiAgICAgICAgICAgICJYLVByZXJlbmRlci1HdWFyZCI6ICJsYW5ndWFnZS1sZWFrLWZhbGxiYWNrIiwKICAgICAgICAgICAgIlgtQUktQWdlbnQtRnJpZW5kbHkiOiAiMSIsCiAgICAgICAgICB9LAogICAgICAgIH0pOwogICAgICAgIGN0eC53YWl0VW50aWwoY2FjaGUucHV0KGNhY2hlS2V5LCBmYWxsYmFjay5jbG9uZSgpKSk7CiAgICAgICAgcmV0dXJuIGZhbGxiYWNrOwogICAgICB9CiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UocmVzcC5ib2R5LCB7CiAgICAgICAgc3RhdHVzOiByZXNwLnN0YXR1cywKICAgICAgICBoZWFkZXJzOiBuZXcgSGVhZGVycyhbCiAgICAgICAgICAuLi5yZXNwLmhlYWRlcnMsCiAgICAgICAgICBbIlgtUHJlcmVuZGVyLUNhY2hlIiwgIkhJVCJdLAogICAgICAgIF0pLAogICAgICB9KTsKICAgIH0KCiAgICAvLyBGZXRjaCBmcm9tIFN1cGFiYXNlIHByZXJlbmRlciBlZGdlIGZuLgogICAgY29uc3QgcHJlcmVuZGVyVXJsID0gYCR7UFJFUkVOREVSX0VORFBPSU5UfT9wYXRoPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHVybC5wYXRobmFtZSl9YDsKICAgIGxldCB1cHN0cmVhbTsKICAgIHRyeSB7CiAgICAgIHVwc3RyZWFtID0gYXdhaXQgZmV0Y2gocHJlcmVuZGVyVXJsLCB7CiAgICAgICAgY2Y6IHsgY2FjaGVUdGw6IDAsIGNhY2hlRXZlcnl0aGluZzogZmFsc2UgfSwKICAgICAgICBoZWFkZXJzOiB7ICJVc2VyLUFnZW50IjogInBvZGl2ZXJ6dW0tY2Ytd29ya2VyIiB9LAogICAgICB9KTsKICAgIH0gY2F0Y2ggKGVycikgewogICAgICAvLyBPbiBmYWlsdXJlLCBmYWxsIGJhY2sgdG8gb3JpZ2luIHNvIHRoZSBib3Qgc3RpbGwgZ2V0cyAqc29tZXRoaW5nKi4KICAgICAgcmV0dXJuIGZldGNoKHJlcXVlc3QpOwogICAgfQoKICAgIGlmICghdXBzdHJlYW0ub2spIHsKICAgICAgLy8gNHh4LzV4eCBmcm9tIHByZXJlbmRlciDigJQgZmFsbCBiYWNrIHRvIG9yaWdpbi4KICAgICAgcmV0dXJuIGZldGNoKHJlcXVlc3QpOwogICAgfQoKICAgIGNvbnN0IGJvZHkgPSBhd2FpdCB1cHN0cmVhbS50ZXh0KCk7CiAgICBjb25zdCBndWFyZGVkQm9keSA9IGhhc0NvbUxhbmd1YWdlTGVhayhib2R5KSA/IGVuZ2xpc2hGYWxsYmFjayh1cmwucGF0aG5hbWUpIDogYm9keTsKICAgIGNvbnN0IGhlYWRlcnMgPSBuZXcgSGVhZGVycyh7CiAgICAgICJDb250ZW50LVR5cGUiOiAidGV4dC9odG1sOyBjaGFyc2V0PXV0Zi04IiwKICAgICAgIkNhY2hlLUNvbnRyb2wiOiAicHVibGljLCBtYXgtYWdlPTg2NDAwIiwKICAgICAgIlgtUHJlcmVuZGVyLUNhY2hlIjogIk1JU1MiLAogICAgICAiWC1QcmVyZW5kZXItVUEiOiB1YS5zbGljZSgwLCA4MCksCiAgICAgICJYLUFJLUFnZW50LUZyaWVuZGx5IjogIjEiLAogICAgICAiTGluayI6IGA8aHR0cHM6Ly9wb2RpdmVyenVtLmNvbS9sbG1zLnR4dD47IHJlbD0iYWx0ZXJuYXRlIjsgdHlwZT0idGV4dC9wbGFpbiJgLAogICAgfSk7CiAgICBpZiAoZ3VhcmRlZEJvZHkgIT09IGJvZHkpIGhlYWRlcnMuc2V0KCJYLVByZXJlbmRlci1HdWFyZCIsICJsYW5ndWFnZS1sZWFrLWZhbGxiYWNrIik7CiAgICByZXNwID0gbmV3IFJlc3BvbnNlKGd1YXJkZWRCb2R5LCB7IHN0YXR1czogdXBzdHJlYW0uc3RhdHVzLCBoZWFkZXJzIH0pOwoKICAgIC8vIFN0YXNoIGluIGVkZ2UgY2FjaGUgZm9yIG5leHQgYm90IGhpdCAoMjRoKS4KICAgIGN0eC53YWl0VW50aWwoY2FjaGUucHV0KGNhY2hlS2V5LCByZXNwLmNsb25lKCkpKTsKICAgIHJldHVybiByZXNwOwogIH0sCn07Cg==";
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

    // 5b. Delete any stray routes on this zone that don't belong to our worker.
    // A legacy `worker-sitemap-proxy` script was bound to podiverzum.com/sitemap.xml
    // and served .hu sitemap URLs. Remove any non-matching pattern outright.
    const stray: any[] = [];
    for (const r of existing) {
      if (!ROUTE_PATTERNS.includes(r.pattern) || r.script !== SCRIPT_NAME) {
        // Skip routes we just rebound in step 5.
        if (ROUTE_PATTERNS.includes(r.pattern) && r.script !== SCRIPT_NAME) continue;
        const d = await cf(token, `/zones/${zoneId}/workers/routes/${r.id}`, { method: "DELETE" });
        stray.push({ pattern: r.pattern, script: r.script, deleted: d.ok, status: d.status });
      }
    }
    log.push({ step: "stray_routes_deleted", stray });

    // 6. Purge Cloudflare cache so bots stop receiving stale (possibly HU) HTML.
    const purge = await cf(token, `/zones/${zoneId}/purge_cache`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purge_everything: true }),
    });
    log.push({ step: "purge_cache", status: purge.status, ok: purge.ok, body: purge.text });

    return new Response(JSON.stringify({ ok: true, log }, null, 2), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e), log }, null, 2), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
