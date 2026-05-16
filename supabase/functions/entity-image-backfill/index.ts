// One-shot (idempotent) backfill: fetch externally-hosted entity_profiles.image_url
// (Wikipedia / Wikimedia, etc.), upload to the public `entity-images` Supabase Storage
// bucket, and rewrite image_url to our own CDN URL. Re-runnable; skips rows already
// hosted on supabase.co.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "entity-images";

function extFromContentType(ct: string | null, urlExt: string): string {
  const c = (ct || "").toLowerCase();
  if (c.includes("webp")) return "webp";
  if (c.includes("png")) return "png";
  if (c.includes("gif")) return "gif";
  if (c.includes("jpeg") || c.includes("jpg")) return "jpg";
  return urlExt || "jpg";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit ?? 50), 200);
    const kind = body.kind as string | undefined;

    let q = sb
      .from("entity_profiles")
      .select("slug,kind,display_name,image_url,image_source")
      .not("image_url", "is", null)
      .not("image_url", "ilike", "%supabase.co/storage%")
      .limit(limit);
    if (kind) q = q.eq("kind", kind);

    const { data: rows, error } = await q;
    if (error) throw error;

    const stats = { processed: 0, uploaded: 0, skipped: 0, errors: 0 };
    const errors: Array<{ slug: string; error: string }> = [];

    for (const row of (rows || []) as any[]) {
      stats.processed++;
      try {
        const src = row.image_url as string;
        const r = await fetch(src, {
          headers: { "User-Agent": "PodiverzumBot/1.0 (https://podiverzum.com)" },
          redirect: "follow",
        });
        if (!r.ok) { stats.errors++; errors.push({ slug: row.slug, error: `HTTP ${r.status}` }); continue; }
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf.byteLength < 500) { stats.skipped++; continue; }
        const urlExt = (src.split("?")[0].split(".").pop() || "jpg").toLowerCase().slice(0, 4);
        const ext = extFromContentType(r.headers.get("content-type"), urlExt);
        const path = `${row.kind}/${row.slug}.${ext}`;
        const ct = r.headers.get("content-type") || `image/${ext === "jpg" ? "jpeg" : ext}`;

        const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
          contentType: ct,
          upsert: true,
          cacheControl: "31536000",
        });
        if (upErr) { stats.errors++; errors.push({ slug: row.slug, error: upErr.message }); continue; }

        const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
        const newUrl = pub.publicUrl;

        const { error: updErr } = await sb
          .from("entity_profiles")
          .update({
            image_url: newUrl,
            image_source: row.image_source ? `${row.image_source}+supabase` : "supabase",
            image_checked_at: new Date().toISOString(),
          })
          .eq("kind", row.kind)
          .eq("slug", row.slug);
        if (updErr) { stats.errors++; errors.push({ slug: row.slug, error: updErr.message }); continue; }

        stats.uploaded++;
      } catch (e) {
        stats.errors++;
        errors.push({ slug: row.slug, error: String((e as Error)?.message || e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, stats, errors: errors.slice(0, 20) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
