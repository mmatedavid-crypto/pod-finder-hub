// x-monitor-watchlist
// Reads active watch accounts, fetches their recent tweets via the X API
// (OAuth 1.0a user context), inserts unseen posts into x_watched_posts and
// pre-matches them to a default Podiverzum URL. Never posts, likes or reposts.
//
// POST {} or {} -> runs the full watchlist
// POST { handles: ["sama"] } -> only those handles
// POST { dry_run: true } -> fetch + match but do not insert
//
// Fails safely: if creds are missing, returns a clear admin message.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hasCreds, xGet } from "../_shared/x-oauth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE = "https://podiverzum.com";

type WatchAccount = {
  id: string;
  x_handle: string;
  display_name: string | null;
  person_slug: string | null;
  default_podiverzum_url: string | null;
  is_active: boolean;
  priority: number;
  last_seen_post_id: string | null;
  x_user_id: string | null;
};

async function resolveUserId(handle: string): Promise<{ id: string; name?: string } | { error: string; status: number }> {
  const r = await xGet(`/users/by/username/${encodeURIComponent(handle)}`);
  if (!r.ok) {
    const txt = await r.text();
    return { error: `users/by/username failed: ${r.status} ${txt.slice(0, 200)}`, status: r.status };
  }
  const j = await r.json();
  if (!j?.data?.id) return { error: "no user data", status: 404 };
  return { id: j.data.id, name: j.data.name };
}

async function fetchRecentTweets(userId: string, sinceId: string | null): Promise<{ tweets?: any[]; error?: string; status?: number; rateLimited?: boolean }> {
  const q: Record<string, string> = {
    max_results: "10",
    "tweet.fields": "created_at,text,referenced_tweets,lang,public_metrics",
    exclude: "retweets,replies",
  };
  if (sinceId) q.since_id = sinceId;
  const r = await xGet(`/users/${userId}/tweets`, q);
  if (r.status === 429) {
    const reset = r.headers.get("x-rate-limit-reset");
    return { error: `rate_limited (reset=${reset})`, status: 429, rateLimited: true };
  }
  if (!r.ok) {
    const txt = await r.text();
    return { error: `tweets fetch failed: ${r.status} ${txt.slice(0, 200)}`, status: r.status };
  }
  const j = await r.json();
  return { tweets: j?.data || [] };
}

function defaultUrlFor(acc: WatchAccount): string | null {
  if (acc.default_podiverzum_url) return acc.default_podiverzum_url;
  if (acc.person_slug) return `${SITE}/person/${acc.person_slug}`;
  return null;
}

function defaultMatchReason(acc: WatchAccount, postText: string | null): string {
  const subject = acc.display_name || acc.x_handle;
  const slug = acc.person_slug;
  if (slug) {
    return `Default match: post by ${subject} → /person/${slug} (podcast appearances, mentions and discussions across shows). Manual confirm needed if the post is off-topic.`;
  }
  if (acc.default_podiverzum_url) {
    return `Default match: post by ${subject} → configured Podiverzum page. Manual confirm needed.`;
  }
  return "No default match — set person_slug or default_podiverzum_url for this account.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!hasCreds()) {
      return new Response(JSON.stringify({
        ok: false,
        error: "X credentials are not configured. Add TWITTER_CONSUMER_KEY, TWITTER_CONSUMER_SECRET, TWITTER_ACCESS_TOKEN and TWITTER_ACCESS_TOKEN_SECRET in backend secrets.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const handles: string[] | undefined = Array.isArray(body.handles) ? body.handles : undefined;
    const dryRun: boolean = body.dry_run === true;

    let q = sb.from("x_watch_accounts").select("*").eq("is_active", true).order("priority", { ascending: false });
    if (handles && handles.length) q = q.in("x_handle", handles);
    const { data: accounts, error } = await q;
    if (error) throw error;

    const results: any[] = [];
    let totalInserted = 0;

    for (const acc of (accounts || []) as WatchAccount[]) {
      const accResult: any = { handle: acc.x_handle, fetched: 0, inserted: 0, errors: [] };
      try {
        let userId = acc.x_user_id;
        if (!userId) {
          const r = await resolveUserId(acc.x_handle);
          if ("error" in r) {
            accResult.errors.push(r.error);
            await sb.from("x_watch_accounts").update({ last_checked_at: new Date().toISOString() }).eq("id", acc.id);
            results.push(accResult);
            continue;
          }
          userId = r.id;
          await sb.from("x_watch_accounts").update({ x_user_id: userId, display_name: acc.display_name || r.name || null }).eq("id", acc.id);
        }

        const tw = await fetchRecentTweets(userId!, acc.last_seen_post_id);
        if (tw.error) {
          accResult.errors.push(tw.error);
          await sb.from("x_watch_accounts").update({ last_checked_at: new Date().toISOString() }).eq("id", acc.id);
          await sb.from("x_reply_audit_log").insert({
            action: "monitor_error",
            actor: "x-monitor-watchlist",
            details: { handle: acc.x_handle, error: tw.error, status: tw.status },
          });
          results.push(accResult);
          if (tw.rateLimited) break; // back off entirely
          continue;
        }

        const tweets = tw.tweets || [];
        accResult.fetched = tweets.length;

        const rows = tweets.map((t: any) => {
          const url = defaultUrlFor(acc);
          return {
            x_post_id: String(t.id),
            x_handle: acc.x_handle,
            post_text: t.text || null,
            post_url: `https://x.com/${acc.x_handle}/status/${t.id}`,
            posted_at: t.created_at || null,
            matched_person_slug: acc.person_slug,
            matched_podiverzum_url: url,
            match_reason: url ? defaultMatchReason(acc, t.text || null) : "needs_review: no default Podiverzum URL configured.",
            relevance_score: url ? 0.5 : null,
            status: url ? "needs_review" : "needs_review",
          };
        });

        if (!dryRun && rows.length) {
          const { data: ins, error: insErr } = await sb
            .from("x_watched_posts")
            .upsert(rows, { onConflict: "x_post_id", ignoreDuplicates: true })
            .select("id, x_post_id");
          if (insErr) {
            accResult.errors.push("insert failed: " + insErr.message);
          } else {
            accResult.inserted = ins?.length || 0;
            totalInserted += accResult.inserted;
            const newestId = tweets.map((t: any) => String(t.id)).sort().pop();
            await sb.from("x_watch_accounts").update({
              last_checked_at: new Date().toISOString(),
              last_seen_post_id: newestId || acc.last_seen_post_id,
            }).eq("id", acc.id);
            await sb.from("x_reply_audit_log").insert({
              action: "monitor_ok",
              actor: "x-monitor-watchlist",
              details: { handle: acc.x_handle, fetched: tweets.length, inserted: accResult.inserted },
            });
          }
        } else {
          await sb.from("x_watch_accounts").update({ last_checked_at: new Date().toISOString() }).eq("id", acc.id);
        }
      } catch (e: any) {
        accResult.errors.push(String(e?.message || e));
      }
      results.push(accResult);
    }

    return new Response(JSON.stringify({
      ok: true,
      dry_run: dryRun,
      accounts: results.length,
      inserted: totalInserted,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
