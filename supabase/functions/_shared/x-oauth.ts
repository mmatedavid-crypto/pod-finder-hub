// Shared OAuth 1.0a helpers for the X (Twitter) API.
// Used by x-monitor-watchlist and x-post-approved-reply.

export const X_API = "https://api.x.com/2";

export function pctEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) =>
    "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export type XCreds = { ck: string; cs: string; at: string; ats: string };

export function getCreds(): XCreds {
  const ck = Deno.env.get("TWITTER_CONSUMER_KEY");
  const cs = Deno.env.get("TWITTER_CONSUMER_SECRET");
  const at = Deno.env.get("TWITTER_ACCESS_TOKEN");
  const ats = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET");
  if (!ck || !cs || !at || !ats) {
    throw new Error("X credentials missing (TWITTER_CONSUMER_KEY/SECRET, TWITTER_ACCESS_TOKEN/SECRET)");
  }
  return { ck, cs, at, ats };
}

export function hasCreds(): boolean {
  try { getCreds(); return true; } catch { return false; }
}

/**
 * Build OAuth 1.0a Authorization header.
 * - For GET requests, pass query params via `queryParams` so they are signed.
 * - For POST requests with JSON body, do NOT include the body in the signature.
 */
export async function buildOAuthHeader(
  method: string,
  url: string,
  creds: XCreds,
  queryParams: Record<string, string> = {},
): Promise<string> {
  const p: Record<string, string> = {
    oauth_consumer_key: creds.ck,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.at,
    oauth_version: "1.0",
  };
  const all: Record<string, string> = { ...p, ...queryParams };
  const paramString = Object.keys(all).sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(all[k])}`).join("&");
  const sigBase = `${method.toUpperCase()}&${pctEncode(url)}&${pctEncode(paramString)}`;
  const signingKey = `${pctEncode(creds.cs)}&${pctEncode(creds.ats)}`;
  p.oauth_signature = await hmacSha1(signingKey, sigBase);
  return "OAuth " + Object.keys(p).sort()
    .map((k) => `${pctEncode(k)}="${pctEncode(p[k])}"`).join(", ");
}

export async function xGet(path: string, query: Record<string, string> = {}): Promise<Response> {
  const creds = getCreds();
  const url = `${X_API}${path}`;
  const auth = await buildOAuthHeader("GET", url, creds, query);
  const qs = Object.keys(query).length
    ? "?" + Object.keys(query).map((k) => `${pctEncode(k)}=${pctEncode(query[k])}`).join("&")
    : "";
  return await fetch(url + qs, { headers: { Authorization: auth } });
}

export async function xPostJson(path: string, body: any): Promise<Response> {
  const creds = getCreds();
  const url = `${X_API}${path}`;
  const auth = await buildOAuthHeader("POST", url, creds);
  return await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
