// search-autocomplete: rich typed typeahead for the public .com search box.
// POST { q: string, limit?: number } -> { suggestions: Suggestion[] }
// English-only by design. No AI call, no user logging, no writes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Suggestion = {
  type: "podcast" | "person" | "topic" | "category" | "organization" | "query";
  label: string;
  subtitle?: string;
  href: string;
  image_url?: string | null;
  confidence: number;
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

function dedupePush(out: Suggestion[], seen: Set<string>, item: Suggestion) {
  const key = `${item.type}:${item.href}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(item);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const rawQ = String(body?.q ?? body?.prefix ?? "").trim();
    const limit = Math.min(12, Math.max(3, Number(body?.limit ?? 8)));
    if (rawQ.length < 2) return json({ suggestions: [] });

    const q = norm(rawQ);
    const ilike = `%${q}%`;
    const ilikeStar = `*${q}*`;
    const prefixStar = `${q}*`;
    const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const [podRes, topicRes, catRes, personRes, companyRes, qcacheRes] = await Promise.all([
      supa.from("podcasts")
        .select("title,display_title,slug,image_url,podiverzum_rank,rank_label,language,rss_status")
        .or(`title.ilike.${ilikeStar},display_title.ilike.${ilikeStar},slug.ilike.${ilikeStar}`)
        .or("language.is.null,language.ilike.en%")
        .not("rss_status", "in", "(failed,inactive)")
        .order("podiverzum_rank", { ascending: false, nullsFirst: false })
        .limit(12),
      supa.from("topic_hubs")
        .select("title,slug,description,appearance_stats,active")
        .eq("active", true)
        .or(`title.ilike.${ilikeStar},slug.ilike.${ilikeStar}`)
        .order("sort_order")
        .limit(8),
      supa.from("categories")
        .select("name,slug")
        .ilike("name", ilike)
        .order("sort_order")
        .limit(5),
      supa.from("entity_profiles")
        .select("display_name,slug,bio,appearance_stats,kind")
        .eq("kind", "person")
        .or(`display_name.ilike.${ilikeStar},slug.ilike.${ilikeStar}`)
        .limit(8),
      supa.from("entity_profiles")
        .select("display_name,slug,bio,appearance_stats,kind")
        .eq("kind", "company")
        .or(`display_name.ilike.${ilikeStar},slug.ilike.${ilikeStar}`)
        .limit(8),
      supa.from("search_query_cache")
        .select("q_norm,hits")
        .ilike("q_norm", `${q}%`)
        .order("hits", { ascending: false })
        .limit(4),
    ]);

    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const rankLabelBonus = (rl: any): number => {
      const s = String(rl || "").toUpperCase();
      if (s === "S") return 0.04;
      if (s === "A") return 0.03;
      if (s === "B") return 0.02;
      return 0;
    };

    for (const p of (podRes.data || []) as any[]) {
      const title = String(p.display_title || p.title || "");
      const tn = norm(title);
      const base = tn === q ? 1 : tn.startsWith(q) ? 0.9 : tn.includes(q) ? 0.72 : 0.55;
      dedupePush(out, seen, {
        type: "podcast",
        label: title,
        subtitle: "Podcast",
        href: `/podcast/${p.slug}`,
        image_url: p.image_url || null,
        confidence: Math.min(0.99, base + rankLabelBonus(p.rank_label)),
      });
    }

    for (const t of (topicRes.data || []) as any[]) {
      const n = Number(t.appearance_stats?.total || t.appearance_stats?.episodes || 0);
      dedupePush(out, seen, {
        type: "topic",
        label: String(t.title || ""),
        subtitle: n ? `${n} episode mentions` : "Topic",
        href: `/topic/${t.slug}`,
        confidence: norm(String(t.title || "")).startsWith(q) ? 0.86 : 0.66,
      });
    }

    for (const c of (catRes.data || []) as any[]) {
      dedupePush(out, seen, {
        type: "category",
        label: String(c.name || ""),
        subtitle: "Category",
        href: `/category/${c.slug}`,
        confidence: norm(String(c.name || "")).startsWith(q) ? 0.78 : 0.58,
      });
    }

    for (const p of (personRes.data || []) as any[]) {
      const n = Number(p.appearance_stats?.total || 0);
      dedupePush(out, seen, {
        type: "person",
        label: String(p.display_name || ""),
        subtitle: n ? `${n} episode mentions` : "Person",
        href: `/person/${p.slug}`,
        confidence: 0.74 + Math.min(0.12, n / 1000),
      });
    }

    for (const o of (companyRes.data || []) as any[]) {
      const n = Number(o.appearance_stats?.total || 0);
      dedupePush(out, seen, {
        type: "organization",
        label: String(o.display_name || ""),
        subtitle: n ? `${n} episode mentions` : "Company",
        href: `/company/${o.slug}`,
        confidence: 0.72 + Math.min(0.12, n / 1000),
      });
    }

    for (const r of (qcacheRes.data || []) as any[]) {
      const label = String(r.q_norm || "");
      if (!label || norm(label) === q) continue;
      dedupePush(out, seen, {
        type: "query",
        label,
        subtitle: "Search query",
        href: `/search?q=${encodeURIComponent(label)}`,
        confidence: 0.5 + Math.min(0.2, Number(r.hits || 0) / 1000),
      });
    }

    out.sort((a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label));
    return json({ suggestions: out.slice(0, limit) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ suggestions: [], error: msg }, 200);
  }
});
