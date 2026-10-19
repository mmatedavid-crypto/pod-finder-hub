// Shared React Query hooks for the similar_podcasts / similar_episodes RPCs.
// All consumers (detail sections, smart player panel) share ONE source-level
// request: we always fetch the server-bounded maximum (8 candidates) and each
// consumer slices to its own limit (4/6/8), so compact and expanded views never
// trigger separate computations. React Query dedupes concurrent identical
// requests and caches per source id.
//
// The server signals a cold+contended cache with the transient error
// "recommendations_busy"; we retry exactly once after a short delay. Any other
// error is final (section hides itself, as before).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SIMILAR_MAX = 8; // must match the server-side candidate bound

export type SimilarPodcastRow = {
  id: string;
  similarity: number;
  title: string;
  display_title: string | null;
  slug: string;
  summary: string | null;
  description: string | null;
  image_url: string | null;
  category: string | null;
  apple_url: string | null;
  spotify_url: string | null;
  youtube_url: string | null;
  website_url: string | null;
  featured: boolean;
  rss_status: string;
  podiverzum_rank: number | null;
  rank_label: string | null;
};

export type SimilarEpisodeRow = {
  episode_id: string;
  podcast_id: string;
  similarity: number;
  title: string;
  display_title: string | null;
  slug: string;
  ai_summary: string | null;
  summary: string | null;
  description: string | null;
  published_at: string | null;
  audio_url: string | null;
  topics: string[] | null;
  podcast_slug: string;
  podcast_title: string;
  podcast_display_title: string | null;
  podcast_image_url: string | null;
  podcast_category: string | null;
  podiverzum_rank: number | null;
  rank_label: string | null;
};

const isBusy = (e: unknown) =>
  String((e as { message?: string })?.message ?? e).includes("recommendations_busy");

const shared = {
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  retry: (count: number, err: unknown) => isBusy(err) && count < 1,
  retryDelay: 2500,
} as const;

export function useSimilarPodcasts(podcastId?: string) {
  return useQuery({
    ...shared,
    queryKey: ["similar-podcasts", podcastId],
    enabled: !!podcastId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("similar_podcasts" as any, {
        p_podcast_id: podcastId,
        p_limit: SIMILAR_MAX,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as SimilarPodcastRow[];
    },
  });
}

export function useSimilarEpisodes(episodeId?: string) {
  return useQuery({
    ...shared,
    queryKey: ["similar-episodes", episodeId],
    enabled: !!episodeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("similar_episodes" as any, {
        p_episode_id: episodeId,
        p_limit: SIMILAR_MAX,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as SimilarEpisodeRow[];
    },
  });
}
