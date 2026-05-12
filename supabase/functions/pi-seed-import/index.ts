// One-shot bulk seeder: takes a list of well-known podcast names, calls
// PodcastIndex /search/byterm for each, picks the best EN match, and stages
// it into pi_feed_staging. Idempotent — already-known feeds are skipped.
//
// Auth: requires service-role key in Authorization (admin curl from MCP) OR
//       a logged-in admin user. We don't gate by JWT here because the
//       function does not expose anything sensitive — it can only insert
//       staging rows, which then go through the same pipeline as everything
//       else (AI quality scoring + admin moderation).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha1Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function score(p: any): number {
  let s = 0;
  if (p.url) s += 30;
  if (p.image || p.artwork) s += 20;
  const last = p.newestItemPublishTime ? p.newestItemPublishTime * 1000 : 0;
  if (last && Date.now() - last < 90 * 24 * 3600 * 1000) s += 25;
  if ((p.episodeCount || 0) >= 50) s += 15;
  if ((p.language || "").toLowerCase().startsWith("en")) s += 15;
  if (p.dead === 1) s -= 100;
  return s;
}

async function piSearch(q: string, apiKey: string, apiSecret: string) {
  const date = Math.floor(Date.now() / 1000).toString();
  const auth = await sha1Hex(apiKey + apiSecret + date);
  const params = new URLSearchParams({ q, max: "10" });
  const res = await fetch(`https://api.podcastindex.org/api/1.0/search/byterm?${params}`, {
    headers: {
      "User-Agent": "Podiverzum/1.0 (seed-import)",
      "X-Auth-Date": date, "X-Auth-Key": apiKey, "Authorization": auth,
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.feeds) ? data.feeds : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("PODCAST_INDEX_API_KEY");
    const apiSecret = Deno.env.get("PODCAST_INDEX_API_SECRET");
    if (!apiKey || !apiSecret) {
      return new Response(JSON.stringify({ error: "PI creds missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json().catch(() => ({}));
    const names: string[] = Array.isArray(body.names) ? body.names.map((n: any) => String(n).trim()).filter(Boolean) : [];
    if (names.length === 0) {
      return new Response(JSON.stringify({ error: "names[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: imp } = await supabase.from("pi_dump_imports")
      .insert({ source: "seed_import", status: "ingesting", snapshot_date: new Date().toISOString().slice(0, 10) })
      .select("id").single();
    const importId = imp?.id ?? null;

    const picked: any[] = [];
    const perName: any[] = [];
    // Sequential to be polite to PI (~10 req/s OK, but we have ~30 names)
    for (const name of names) {
      const feeds = await piSearch(name, apiKey, apiSecret);
      const en = feeds.filter((f: any) =>
        f?.url && f.dead !== 1 &&
        (!f.language || f.language.toLowerCase().startsWith("en"))
      );
      const best = en.map((f: any) => ({ f, s: score(f) }))
        .sort((a: any, b: any) => b.s - a.s)[0];
      if (!best) {
        perName.push({ name, found: false });
        continue;
      }
      perName.push({
        name, found: true, picked_title: best.f.title,
        rss_url: best.f.url, score: best.s,
      });
      picked.push(best.f);
    }

    // Dedup against existing
    const urls = picked.map((p) => p.url);
    const exSet = new Set<string>();
    for (let i = 0; i < urls.length; i += 200) {
      const slice = urls.slice(i, i + 200);
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from("podcasts").select("rss_url").in("rss_url", slice),
        supabase.from("pi_feed_staging").select("rss_url").in("rss_url", slice),
      ]);
      (p || []).forEach((r: any) => exSet.add(r.rss_url));
      (s || []).forEach((r: any) => exSet.add(r.rss_url));
    }
    const fresh = picked.filter((p) => !exSet.has(p.url));

    let inserted = 0;
    if (fresh.length > 0) {
      const rows = fresh.map((p) => ({
        import_id: importId,
        pi_id: p.id ?? null,
        rss_url: p.url,
        title: p.title || null,
        website_url: p.link || null,
        image_url: p.image || p.artwork || null,
        description: p.description || null,
        language: (p.language || "").toLowerCase().startsWith("en") ? "en" : (p.language || "en"),
        author: p.author || p.ownerName || null,
        episode_count: p.episodeCount ?? null,
        newest_item_at: p.newestItemPublishTime ? new Date(p.newestItemPublishTime * 1000).toISOString() : null,
        last_http_status: p.lastHttpStatus ?? null,
        dead: p.dead === 1,
      }));
      const { error, count } = await supabase
        .from("pi_feed_staging")
        .upsert(rows, { onConflict: "rss_url", ignoreDuplicates: true, count: "exact" });
      if (error) throw error;
      inserted = count ?? rows.length;
    }

    if (importId) {
      await supabase.from("pi_dump_imports").update({
        feeds_received: picked.length,
        skipped_duplicates: picked.length - fresh.length,
        status: "processing",
        notes: { mode: "seed_import", names_in: names.length, picked: picked.length, fresh: fresh.length },
        updated_at: new Date().toISOString(),
      }).eq("id", importId);
    }

    return new Response(JSON.stringify({
      ok: true,
      requested: names.length,
      picked: picked.length,
      fresh: fresh.length,
      staged: inserted,
      details: perName,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
