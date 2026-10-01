import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { PodcastCover } from "@/components/PodcastCover";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Apple, ArrowRight, BarChart3, Globe2, Music, Radio, Sigma, Youtube } from "lucide-react";

type ChartSource = "apple" | "spotify" | "youtube";

type Row = {
  id: string;
  title: string;
  display_title: string | null;
  slug: string;
  image_url: string | null;
  category: string | null;
  podiverzum_rank: number | null;
  rank_label: string | null;
  trending_score: number;
  source_count: number;
  best_rank: number;
  sources: { source: ChartSource; rank: number }[];
  snapshot_at: string;
};

type Filter = "all" | "multi" | ChartSource;

const ICON: Record<ChartSource, typeof Apple> = { apple: Apple, spotify: Music, youtube: Youtube };
const LABEL: Record<ChartSource, string> = { apple: "Apple", spotify: "Spotify", youtube: "YouTube" };

export default function ToplistPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.rpc("get_trending_podcasts" as any, { p_limit: 100, p_country: "us" } as any);
      if (!active) return;
      setRows((((data as any[]) || []) as Row[]).map((r) => ({
        ...r,
        trending_score: Number(r.trending_score || 0),
        source_count: Number(r.source_count || r.sources?.length || 0),
        best_rank: Number(r.best_rank || 0),
      })));
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "multi") return rows.filter((r) => r.source_count >= 2);
    return rows.filter((r) => r.sources?.some((s) => s.source === filter));
  }, [rows, filter]);

  const snapshotLabel = rows[0]?.snapshot_at
    ? new Date(rows[0].snapshot_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "";
  const leader = filtered[0];
  const coverage = rows.length ? rows.filter((r) => r.source_count >= 2).length : 0;

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "multi", label: "Multi-source" },
    { id: "apple", label: "Apple" },
    { id: "spotify", label: "Spotify" },
    { id: "youtube", label: "YouTube" },
  ];

  return (
    <Layout>
      <Seo
        title="Podcast Toplist - Apple, Spotify and YouTube fusion | Podiverzum"
        description="A cross-platform podcast toplist built with reciprocal-rank fusion across Apple Podcasts, Spotify and YouTube chart signals."
        canonical="https://podiverzum.com/toplist"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Podiverzum Podcast Toplist",
          url: "https://podiverzum.com/toplist",
          description: "Cross-platform podcast ranking using reciprocal-rank fusion.",
        }}
      />

      <section className="relative overflow-hidden border-b border-border bg-background">
        <div aria-hidden className="absolute inset-0 hero-spot" />
        <div aria-hidden className="absolute inset-0 bg-grid opacity-60" />
        <div className="relative container mx-auto py-8 sm:py-12">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                Cross-platform rank
              </div>
              <h1 className="mt-5 max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">
                Podcast toplist, fused by <span className="text-brand-gradient">reciprocal rank.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Apple, Spotify and YouTube chart signals are normalized into one score:
                <span className="text-foreground"> score = sum(1 / rank)</span>. A show rises when it performs well across more than one platform.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="chip-brand"><Sigma className="mr-1.5 h-3.5 w-3.5" /> Reciprocal-rank fusion</span>
                <span className="chip"><Globe2 className="mr-1.5 h-3.5 w-3.5" /> US market seed</span>
                <span className="chip"><Radio className="mr-1.5 h-3.5 w-3.5" /> Daily snapshots</span>
              </div>
            </div>

            <div className="surface rounded-lg p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current leader</div>
              {leader ? (
                <Link to={`/podcast/${leader.slug}`} className="mt-3 flex gap-4 group">
                  <div className="w-24 shrink-0">
                    <PodcastCover title={leader.display_title || leader.title} src={leader.image_url} size="lg" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl font-semibold leading-tight group-hover:underline">
                      {leader.display_title || leader.title}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{leader.category || "Podcast"}</div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <Metric label="Score" value={leader.trending_score.toFixed(3)} />
                      <Metric label="Sources" value={String(leader.source_count)} />
                      <Metric label="Best" value={`#${leader.best_rank}`} />
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="mt-3 text-sm text-muted-foreground">Waiting for the first chart snapshot.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto py-8 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Top 100</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {snapshotLabel ? `Latest snapshot: ${snapshotLabel}. ` : ""}
              {coverage} shows currently have signals from at least two platforms.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  filter === f.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:bg-secondary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading chart...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card/60 p-6 text-sm text-muted-foreground">
            No chart rows for this filter yet. Run the chart snapshot job to populate the reciprocal-rank table.
          </div>
        ) : (
          <ol className="overflow-hidden rounded-lg border border-border bg-card/70">
            {filtered.map((p, idx) => {
              const title = p.display_title || p.title;
              return (
                <li key={p.id} className="border-b border-border/70 last:border-b-0">
                  <Link
                    to={`/podcast/${p.slug}`}
                    className="grid grid-cols-[2.5rem_3.5rem_minmax(0,1fr)] items-center gap-3 px-3 py-3 transition hover:bg-secondary/60 sm:grid-cols-[3rem_4rem_minmax(0,1fr)_9rem]"
                  >
                    <div className="text-right text-lg font-semibold tabular-nums text-muted-foreground">
                      {idx + 1}
                    </div>
                    <PodcastCover title={title} src={p.image_url} size="sm" />
                    <div className="min-w-0">
                      <div className="line-clamp-2 font-medium leading-snug">{title}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {p.sources?.map((s) => {
                          const SourceIcon = ICON[s.source];
                          return (
                            <span key={`${p.id}:${s.source}`} className="inline-flex items-center gap-1" title={`${LABEL[s.source]} #${s.rank}`}>
                              <SourceIcon className="h-3 w-3" />
                              {LABEL[s.source]} #{s.rank}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                      <div className="text-foreground">{p.trending_score.toFixed(3)}</div>
                      <div>{p.source_count} source{p.source_count === 1 ? "" : "s"}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        <section className="border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Methodology</h2>
          <p className="max-w-3xl">
            Each source contributes the reciprocal of its rank. A #1 placement contributes 1.000, #10 contributes 0.100, and #50 contributes 0.020.
            The resulting score is transparent, additive and useful as a durable metric for platform breadth, chart persistence and movement over time.
          </p>
        </section>
      </div>
    </Layout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
    </div>
  );
}
