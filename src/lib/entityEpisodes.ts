import { supabase } from "@/integrations/supabase/client";

/**
 * Episode loading for topic/entity pages.
 *
 * Two sources, merged and de-duplicated:
 *  1. Cached `episode_ids` (topic_hubs / entity_profiles) — bounded primary-key
 *     lookups, always fast. Refreshed by the existing generators
 *     (topic-hub-generate / entity-profile-generate), so they can lag new episodes.
 *  2. A live lookup (GIN-indexed array overlap, or a caller-provided fallback) so
 *     newly tagged episodes still appear before the cache is regenerated.
 *
 * `failed` is true only when every attempted source errored — callers must show
 * a "temporarily unavailable" state instead of treating it as "no episodes".
 */
export const ENTITY_EP_SELECT =
  "id,title,display_title,description,summary,ai_summary,published_at,audio_url,episode_url,image_url,slug,podcast_id,episode_rank,episode_rank_label,topics,people,companies,tickers,ingredients,people_roles,podcasts(id,title,display_title,slug,image_url,category,podiverzum_rank,rank_label,rss_status,featured,language)";

const ID_CHUNK = 25;
const MAX_CACHED = 300;

export type EntityEpisodesResult = { rows: any[]; failed: boolean };

export async function loadEntityEpisodes(opts: {
  cachedIds?: string[] | null;
  live?: () => PromiseLike<{ data: any[] | null; error: any }>;
}): Promise<EntityEpisodesResult> {
  const ids = Array.from(new Set((opts.cachedIds || []).filter(Boolean))).slice(0, MAX_CACHED);
  const tasks: Promise<{ ok: boolean; rows: any[] }>[] = [];

  if (ids.length) {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
    tasks.push(
      Promise.all(
        chunks.map((c) => supabase.from("episodes").select(ENTITY_EP_SELECT).in("id", c)),
      ).then(
        (results) => {
          const ok = results.every((r) => !r.error); // partial lists could flip noindex — treat as failure
          return { ok, rows: results.flatMap((r) => (r.error ? [] : (r.data as any[]) || [])) };
        },
        () => ({ ok: false, rows: [] }),
      ),
    );
  }
  if (opts.live) {
    tasks.push(
      Promise.resolve(opts.live()).then(
        (r) => ({ ok: !r.error, rows: r.error ? [] : r.data || [] }),
        () => ({ ok: false, rows: [] }),
      ),
    );
  }
  if (!tasks.length) return { rows: [], failed: false };

  const settled = await Promise.all(tasks);
  const byId = new Map<string, any>();
  settled.forEach((s) => s.rows.forEach((r: any) => { if (r?.id && !byId.has(r.id)) byId.set(r.id, r); }));
  return { rows: Array.from(byId.values()), failed: settled.every((s) => !s.ok) };
}

/** Healthy, English parent feed (site-wide EN-only rule). */
export function isVisibleEpisode(e: any): boolean {
  const ps = e?.podcasts;
  if (!ps) return false;
  if (ps.rss_status === "failed" || ps.rss_status === "inactive") return false;
  const lang = (ps.language || "").toLowerCase();
  if (lang && !lang.startsWith("en")) return false;
  return true;
}
