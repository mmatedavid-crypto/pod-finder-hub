import { EpisodeList, EpisodeLite } from "./EpisodeCard";
import { Sparkles } from "lucide-react";
import { useSimilarEpisodes, type SimilarEpisodeRow } from "@/lib/useSimilar";

function rowToEpisode(r: SimilarEpisodeRow): EpisodeLite {
  return {
    id: r.episode_id,
    title: r.title,
    display_title: r.display_title,
    slug: r.slug,
    ai_summary: r.ai_summary,
    summary: r.summary,
    description: r.description,
    published_at: r.published_at,
    audio_url: r.audio_url,
    topics: r.topics,
    podcasts: {
      slug: r.podcast_slug,
      title: r.podcast_title,
      display_title: r.podcast_display_title,
      image_url: r.podcast_image_url,
      category: r.podcast_category,
      podiverzum_rank: r.podiverzum_rank ?? undefined,
    },
  };
}

export function SimilarEpisodes({ episodeId, limit = 6 }: { episodeId: string; limit?: number }) {
  const { data, isLoading } = useSimilarEpisodes(episodeId);
  const items = (data ?? []).slice(0, limit).map(rowToEpisode);

  if (isLoading || items.length === 0) return null;
  return (
    <section id="similar" className="mt-10 scroll-mt-24">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Similar episodes</h2>
        <span className="text-[11px] text-muted-foreground">AI-matched by meaning</span>
      </div>
      <EpisodeList items={items} />
    </section>
  );
}
