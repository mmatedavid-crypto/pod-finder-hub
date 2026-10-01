import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PodcastCover } from "@/components/PodcastCover";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, BarChart3 } from "lucide-react";

type ToplistRow = {
  id: string;
  title: string;
  display_title: string | null;
  slug: string;
  image_url: string | null;
  category: string | null;
  trending_score: number;
  source_count: number;
  best_rank: number;
};

export function ToplistPreview() {
  const [rows, setRows] = useState<ToplistRow[]>([]);

  useEffect(() => {
    let active = true;
    supabase
      .rpc("get_trending_podcasts" as any, { p_limit: 6, p_country: "us" } as any)
      .then(({ data }) => {
        if (!active) return;
        setRows((((data as any[]) || []) as ToplistRow[]).map((r) => ({
          ...r,
          trending_score: Number(r.trending_score || 0),
          source_count: Number(r.source_count || 0),
          best_rank: Number(r.best_rank || 0),
        })));
      });
    return () => { active = false; };
  }, []);

  if (rows.length === 0) return null;

  return (
    <section className="relative overflow-hidden rounded-lg border border-border bg-card/70 p-4 sm:p-5">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            Reciprocal-rank fusion
          </div>
          <h2 className="mt-1 text-xl font-semibold sm:text-2xl">Cross-platform toplist</h2>
        </div>
        <Link to="/toplist" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          View toplist <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {rows.slice(0, 3).map((p, idx) => {
          const title = p.display_title || p.title;
          return (
            <Link
              key={p.id}
              to={`/podcast/${p.slug}`}
              className="group grid grid-cols-[2rem_3.5rem_minmax(0,1fr)] items-center gap-3 rounded-md border border-border/70 bg-background/35 p-3 transition hover:border-primary/40 hover:bg-secondary/50"
            >
              <div className="text-right text-lg font-semibold tabular-nums text-muted-foreground">{idx + 1}</div>
              <PodcastCover title={title} src={p.image_url} size="sm" />
              <div className="min-w-0">
                <div className="line-clamp-2 text-sm font-medium leading-snug group-hover:underline">{title}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {p.trending_score.toFixed(3)} score - {p.source_count} source{p.source_count === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
