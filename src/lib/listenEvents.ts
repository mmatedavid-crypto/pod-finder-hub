import { supabase } from "@/integrations/supabase/client";

type EventType = "listen_click" | "audio_play";
type Platform = "audio" | "spotify" | "apple" | "youtube" | "original" | "external";

export function logEpisodeEvent(opts: {
  episodeId?: string | null;
  podcastId?: string | null;
  eventType: EventType;
  platform: Platform;
}) {
  // fire-and-forget, never block UI
  try {
    const payload = {
      episode_id: opts.episodeId ?? null,
      podcast_id: opts.podcastId ?? null,
      event_type: opts.eventType,
      platform: opts.platform,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      viewport_width: typeof window !== "undefined" ? window.innerWidth : null,
    };
    void supabase.from("episode_events").insert(payload);
  } catch {
    /* silent */
  }
}
