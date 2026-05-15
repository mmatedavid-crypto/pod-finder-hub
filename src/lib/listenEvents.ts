import { supabase } from "@/integrations/supabase/client";

type EventType = "listen_click" | "audio_play";
type Platform = "audio" | "spotify" | "apple" | "youtube" | "original" | "external";

export function logEpisodeEvent(opts: {
  episodeId?: string | null;
  podcastId?: string | null;
  eventType: EventType;
  platform: Platform;
  searchQuery?: string | null;
  searchRank?: number | null;
}) {
  // fire-and-forget, never block UI
  try {
    const payload: Record<string, unknown> = {
      episode_id: opts.episodeId ?? null,
      podcast_id: opts.podcastId ?? null,
      event_type: opts.eventType,
      platform: opts.platform,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      viewport_width: typeof window !== "undefined" ? window.innerWidth : null,
    };
    if (opts.searchQuery) payload.search_query = opts.searchQuery.trim().toLowerCase().slice(0, 200);
    if (typeof opts.searchRank === "number" && opts.searchRank > 0) payload.search_rank = opts.searchRank;
    void supabase.from("episode_events").insert(payload);
  } catch {
    /* silent */
  }
}
