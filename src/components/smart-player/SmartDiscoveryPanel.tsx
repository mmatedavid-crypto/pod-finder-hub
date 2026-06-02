import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Radio, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSmartPlayer, type SmartPlayerEpisode } from "./SmartPlayerProvider";

type Row = {
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
};

type Props = {
  episodeIdOverride?: string;
  variant?: "panel" | "compact";
};

export function SmartDiscoveryPanel({ episodeIdOverride, variant = "panel" }: Props = {}) {
  const { currentEpisode, play, setExpanded } = useSmartPlayer();
  const episodeId = episodeIdOverride ?? currentEpisode?.id;
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const isCompact = variant === "compact";

  useEffect(() => {
    let cancelled = false;
    if (!episodeId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setFailed(false);
    supabase
      .rpc("similar_episodes" as any, { p_episode_id: episodeId, p_limit: isCompact ? 4 : 8 })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !Array.isArray(data)) {
          setItems([]);
          setFailed(true);
        } else {
          setItems((data as Row[]).filter((r) => r.audio_url));
        }
        if (!cancelled) setLoading(false);
      }, () => {
        if (!cancelled) { setItems([]); setFailed(true); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [episodeId, isCompact]);

  const podcastCount = useMemo(() => {
    const s = new Set<string>();
    items.forEach((r) => s.add(r.podcast_id));
    return s.size;
  }, [items]);

  if (!episodeId) return null;
  if (!loading && !failed && items.length === 0) return null;

  const launch = (r: Row) => {
    if (!r.audio_url) return;
    const ep: SmartPlayerEpisode = {
      id: r.episode_id,
      title: r.display_title || r.title,
      podcastId: r.podcast_id,
      podcastTitle: r.podcast_display_title || r.podcast_title,
      podcastSlug: r.podcast_slug,
      episodeSlug: r.slug,
      imageUrl: r.podcast_image_url,
      audioUrl: r.audio_url,
    };
    play(ep);
  };

  return (
    <div className={isCompact ? "w-full" : "w-full max-w-3xl"}>
      {!isCompact && (
        <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          {loading ? (
            <span>Finding related episodes...</span>
          ) : (
            <span>{podcastCount} related shows found</span>
          )}
        </div>
      )}

      {failed && (
        <div className="text-xs text-amber-500 mb-3">
          Related episodes are temporarily unavailable.
        </div>
      )}

      <section>
        {!isCompact && (
          <>
            <div className="flex items-baseline gap-2 mb-2">
              <Radio className="h-4 w-4 text-accent shrink-0" />
              <h3 className="text-sm font-semibold tracking-wide">Similar episodes</h3>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              AI-matched by meaning across other shows in the index.
            </p>
          </>
        )}

        {loading && items.length === 0 ? (
          <div className="text-xs text-muted-foreground">Matching episodes...</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((r) => {
              const epHref = `/podcast/${r.podcast_slug}/${r.slug}`;
              const summary = r.ai_summary || r.summary || r.description;
              return (
                <div
                  key={r.episode_id}
                  className="snap-start shrink-0 w-[240px] rounded-xl border border-border bg-card/60 hover:bg-card transition-colors p-3 flex flex-col gap-2"
                >
                  {r.podcast_image_url && (
                    <img
                      src={r.podcast_image_url}
                      alt=""
                      className="h-28 w-full rounded-md object-cover border border-border"
                      loading="lazy"
                    />
                  )}
                  <Link
                    to={epHref}
                    onClick={() => setExpanded(false)}
                    className="text-[13px] font-medium leading-snug line-clamp-2 hover:text-accent"
                  >
                    {r.display_title || r.title}
                  </Link>
                  <div className="text-[10.5px] text-muted-foreground truncate">
                    {r.podcast_display_title || r.podcast_title}
                  </div>
                  {summary && (
                    <div className="text-[10.5px] leading-snug rounded-md bg-accent/10 text-accent px-2 py-1 line-clamp-2">
                      {summary}
                    </div>
                  )}
                  <div className="mt-auto flex items-center gap-2">
                    <button
                      onClick={() => launch(r)}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                      aria-label={`Play ${r.title}`}
                    >
                      ▶ Play
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
