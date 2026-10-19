import { PodcastCard } from "./PodcastCard";
import { Sparkles } from "lucide-react";
import { useSimilarPodcasts } from "@/lib/useSimilar";

export function SimilarPodcasts({ podcastId, limit = 6 }: { podcastId: string; limit?: number }) {
  const { data, isLoading } = useSimilarPodcasts(podcastId);
  const items = (data ?? []).slice(0, limit);

  if (isLoading || items.length === 0) return null;
  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">If you like this, try…</h2>
        <span className="text-[11px] text-muted-foreground">Sound-alike podcasts</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((p) => <PodcastCard key={p.id} p={p} />)}
      </div>
    </section>
  );
}
