import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { EpisodeList, EpisodeLite } from "@/components/EpisodeCard";
import { PodcastCard, PodcastLite } from "@/components/PodcastCard";
import { Seo } from "@/components/Seo";
import { siteOrigin } from "@/lib/seo-helpers";
import NotFoundState from "@/components/NotFoundState";
import { compareByScore, episodeScore } from "@/lib/episodeRank";
import EntityPage from "./EntityPage";

type TopicHub = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  accent_hsl: string | null;
  aliases: string[];
  bio: string | null;
  episodes_summary: string | null;
  featured_episode_ids: string[];
  appearance_stats: any;
  generated_at: string | null;
};

export default function TopicHubPage() {
  const { slug = "" } = useParams();
  const decoded = useMemo(() => decodeURIComponent(slug).toLowerCase(), [slug]);
  const [hub, setHub] = useState<TopicHub | null | "missing">(null);
  const [eps, setEps] = useState<EpisodeLite[]>([]);
  const [pods, setPods] = useState<PodcastLite[]>([]);
  const [related, setRelated] = useState<{ kind: string; v: string; n: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Step 1: try to find a curated hub by slug.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("topic_hubs")
        .select("*")
        .eq("slug", decoded)
        .eq("active", true)
        .maybeSingle();
      setHub((data as TopicHub) || "missing");
    })();
  }, [decoded]);

  // Step 2: when hub is found, load matching episodes via aliases overlap.
  useEffect(() => {
    if (!hub || hub === "missing") return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("episodes")
        .select("id,title,display_title,description,summary,ai_summary,published_at,audio_url,episode_url,image_url,slug,podcast_id,episode_rank,episode_rank_label,topics,people,companies,tickers,podcasts!inner(id,title,display_title,slug,image_url,category,podiverzum_rank,rank_label,rss_status,featured,language)")
        .overlaps("topics", hub.aliases)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(400);
      const visible = (data || []).filter((e: any) => {
        const ps = e.podcasts;
        if (!ps) return false;
        if (ps.rss_status === "failed" || ps.rss_status === "inactive") return false;
        const lang = (ps.language || "").toLowerCase();
        if (lang && !lang.startsWith("en")) return false;
        return true;
      });
      const sorted = visible.slice().sort(compareByScore);
      setEps(sorted.slice(0, 60) as any);

      // Related podcasts
      const podMap = new Map<string, any>();
      visible.forEach((e: any) => { if (e.podcasts) podMap.set(e.podcast_id, e.podcasts); });
      const podIds = Array.from(podMap.keys());
      if (podIds.length) {
        const { data: ps } = await supabase
          .from("podcasts")
          .select("id,title,display_title,slug,summary,description,image_url,category,apple_url,spotify_url,youtube_url,website_url,featured,rss_status,podiverzum_rank")
          .in("id", podIds);
        const sortedPods = (ps || [])
          .filter((p: any) => p.featured || (p.rss_status !== "failed" && p.rss_status !== "inactive"))
          .sort((a: any, b: any) => (b.podiverzum_rank || 0) - (a.podiverzum_rank || 0))
          .slice(0, 9);
        setPods(sortedPods);
      }

      // Related entities (people, companies, tickers, other topics)
      const tally = new Map<string, { kind: string; v: string; n: number }>();
      const aliasSet = new Set(hub.aliases.map((a) => a.toLowerCase()));
      visible.forEach((e: any) => {
        ["people", "companies", "tickers", "topics"].forEach((col) => {
          const k = col === "people" ? "person" : col === "companies" ? "company" : col === "tickers" ? "ticker" : "topic";
          const arr: string[] = e[col] || [];
          arr.forEach((v) => {
            if (k === "topic" && aliasSet.has(v.toLowerCase())) return;
            const key = `${k}:${v.toLowerCase()}`;
            const cur = tally.get(key);
            if (cur) cur.n++; else tally.set(key, { kind: k, v, n: 1 });
          });
        });
      });
      const co = Array.from(tally.values()).sort((a, b) => b.n - a.n).slice(0, 16);
      setRelated(co);

      setLoading(false);

      // Trigger AI generation if missing/stale
      const stale = !hub.generated_at || (Date.now() - new Date(hub.generated_at).getTime()) / 86400_000 > 30;
      if (stale) {
        supabase.functions.invoke("topic-hub-generate", { body: { slug: hub.slug } }).catch(() => {});
      }
    })();
  }, [hub]);

  // Fall back to plain EntityPage if no curated hub for this slug.
  if (hub === "missing") return <EntityPage kind="topic" />;
  if (!hub || loading) return <Layout><div className="container mx-auto py-20 text-muted-foreground">Loading…</div></Layout>;

  if (!eps.length) {
    return (
      <NotFoundState
        title={`No episodes about ${hub.title}`}
        message={`Podiverzum hasn't indexed enough podcast episodes about ${hub.title} yet. Try the search instead.`}
      />
    );
  }

  const featuredIdSet = new Set(hub.featured_episode_ids || []);
  const featuredEps = featuredIdSet.size
    ? eps.filter((e) => featuredIdSet.has((e as any).id))
        .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime())
        .slice(0, 12)
    : eps.slice(0, 12);
  const remainder = featuredIdSet.size ? eps.filter((e) => !featuredIdSet.has((e as any).id)) : eps.slice(12);
  const newest = remainder.slice().sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime()).slice(0, 12);
  const best = remainder.slice().sort((a, b) => episodeScore(b) - episodeScore(a)).slice(0, 12);
  const last30 = eps.filter((e) => e.published_at && Date.now() - new Date(e.published_at).getTime() < 30 * 86400_000).length;
  const pageUrl = `${siteOrigin()}/topic/${hub.slug}`;
  const accent = hub.accent_hsl ? { background: `hsl(${hub.accent_hsl} / 0.12)` } : undefined;

  return (
    <Layout>
      <Seo
        title={`${hub.title} podcasts — Podiverzum`}
        description={hub.description || `Discover podcast episodes about ${hub.title}, ranked by relevance, freshness and source quality.`}
        canonical={pageUrl}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${hub.title} podcast episodes`,
            url: pageUrl,
            about: { "@type": "Thing", name: hub.title, ...(hub.bio ? { description: hub.bio } : {}) },
          },
        ]}
      />
      <section className="border-b border-border bg-background relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={accent} />
        <div className="container mx-auto py-12 sm:py-14 max-w-5xl relative">
          <div className="text-[10px] uppercase tracking-[0.22em] text-primary">Topic{hub.category ? ` · ${hub.category}` : ""}</div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-2 leading-[1.05]">{hub.title}</h1>
          {hub.bio ? (
            <p className="text-foreground/90 mt-4 max-w-2xl text-[15px] leading-relaxed">{hub.bio}</p>
          ) : hub.description ? (
            <p className="text-foreground/90 mt-4 max-w-2xl text-[15px] leading-relaxed">{hub.description}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Stat label="Episodes indexed" value={eps.length} />
            <Stat label="Last 30 days" value={last30} />
            <Stat label="Podcasts" value={pods.length} />
          </div>
          {hub.episodes_summary && (
            <div className="mt-7 max-w-3xl rounded-2xl border border-border/70 bg-card/60 p-5 sm:p-6">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">How podcasts cover this</div>
              <p className="text-sm sm:text-[15px] leading-relaxed text-foreground/85">{hub.episodes_summary}</p>
            </div>
          )}
          {hub.aliases.length > 1 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {hub.aliases.slice(0, 12).map((a) => (
                <span key={a} className="text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground">{a}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="container mx-auto py-10 max-w-5xl space-y-12">
        {featuredEps.length > 0 && (
          <section className="sm:rounded-2xl sm:border sm:border-primary/30 sm:bg-primary/[0.04] sm:p-6">
            <div className="mb-3">
              <h2 className="text-xl font-semibold">Featured on {hub.title}</h2>
              <p className="text-xs text-muted-foreground mt-1">Strongest episodes by quality and freshness.</p>
            </div>
            <EpisodeList items={featuredEps} showEntities />
          </section>
        )}

        {newest.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-3">
              <h2 className="text-xl font-semibold">Latest</h2>
            </div>
            <EpisodeList items={newest} showEntities />
          </section>
        )}

        {best.length > 0 && (
          <section className="sm:rounded-2xl sm:border sm:border-border/70 sm:bg-card/40 sm:p-6">
            <div className="mb-3">
              <h2 className="text-xl font-semibold">Worth hearing</h2>
              <p className="text-xs text-muted-foreground mt-1">Strong matches across the index.</p>
            </div>
            <EpisodeList items={best} showEntities />
          </section>
        )}

        {pods.length > 0 && (
          <section>
            <div className="mb-3">
              <h2 className="text-xl font-semibold">Podcasts covering {hub.title}</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pods.map((p) => <PodcastCard key={p.id} p={p} />)}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section>
            <div className="mb-3">
              <h2 className="text-xl font-semibold">Related people, companies & topics</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {related.map(({ kind: k, v }) => {
                const s = k === "ticker" ? v.replace(/[^a-zA-Z0-9.]+/g, "").toUpperCase() : v.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                return (
                  <Link key={`${k}-${v}`} to={`/${k}/${encodeURIComponent(s)}`}
                    className="px-3 py-1.5 rounded-full border border-border bg-card text-sm hover:border-primary/50 hover:bg-primary/10 hover:text-foreground transition-colors inline-flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{k}</span>
                    <span>{v}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <p className="text-xs text-muted-foreground pt-4 border-t border-border/60">
          Indexed from public RSS feeds. Ranked by relevance, freshness and source quality.
        </p>
      </div>
    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 px-4 py-2.5 min-w-[110px]">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
