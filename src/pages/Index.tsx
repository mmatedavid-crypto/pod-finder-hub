import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { PodcastCard, PodcastLite } from "@/components/PodcastCard";
import { EpisodeList, EpisodeLite } from "@/components/EpisodeCard";
import { Search, ArrowRight, Sparkles } from "lucide-react";
import { Seo } from "@/components/Seo";
import { compareByScore } from "@/lib/episodeRank";
import { MoodCollections } from "@/components/MoodCollections";
import { Skeleton } from "@/components/Skeletons";
import { ContinueListening } from "@/components/ContinueListening";
import { RecentlyAddedPodcasts } from "@/components/RecentlyAddedPodcasts";
import { TrendingEntities } from "@/components/TrendingEntities";
import { topEntitiesFrom } from "@/lib/aggregateEntities";
import { AskPodiverzum } from "@/components/AskPodiverzum";


type Category = { id: string; name: string; slug: string; description: string | null };

const HOMEPAGE_EPISODE_LIMIT = 240;

type FeedEpisode = EpisodeLite & { freshness_bucket?: "hot" | "fresh" | "recent" };

const Index = () => {
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Category[]>([]);
  const [podcasts, setPodcasts] = useState<(PodcastLite & { podiverzum_rank?: number; featured?: boolean })[]>([]);
  const [trendingEps, setTrendingEps] = useState<FeedEpisode[]>([]);
  const [allEps, setAllEps] = useState<FeedEpisode[]>([]);
  const [evergreenEps, setEvergreenEps] = useState<EpisodeLite[]>([]);
  const [trendingEntityEps, setTrendingEntityEps] = useState<EpisodeLite[]>([]);
  const [chipPool, setChipPool] = useState<{ label: string; query: string }[]>([
    { label: "Nvidia earnings", query: "Nvidia earnings" },
    { label: "Sam Altman", query: "Sam Altman" },
    { label: "GLP-1 drugs", query: "GLP-1 drugs" },
    { label: "AI regulation", query: "AI regulation" },
    { label: "longevity", query: "longevity" },
    { label: "Warren Buffett", query: "Warren Buffett" },
    { label: "Tesla robotaxi", query: "Tesla robotaxi" },
    { label: "founder interviews", query: "founder interviews" },
    { label: "sleep science", query: "sleep science" },
    { label: "European politics", query: "European politics" },
  ]);
  
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [heroPlaceholder, setHeroPlaceholder] = useState(
    typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
      ? "Try: Nvidia earnings, GLP-1 drugs, AI regulation…"
      : "Search topics or ideas…"
  );
  const nav = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setHeroPlaceholder(mq.matches ? "Try: Nvidia earnings, GLP-1 drugs, AI regulation…" : "Search topics or ideas…");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "search_suggestions")
      .maybeSingle()
      .then(({ data }) => {
        const items = (data?.value as any)?.items;
        if (Array.isArray(items) && items.length) {
          const cleaned = items.filter((c: any) => c?.label && c?.query);
          if (cleaned.length >= 4) setChipPool(cleaned);
        }
      });
  }, []);

  // Stable per-week rotation: same chips for ~7 days, shifts on week boundary
  const visibleChips = useMemo(() => {
    if (!chipPool.length) return [];
    const week = Math.floor(Date.now() / (7 * 86400_000));
    const offset = week % chipPool.length;
    const n = Math.min(5, chipPool.length);
    return Array.from({ length: n }, (_, i) => chipPool[(offset + i) % chipPool.length]);
  }, [chipPool]);

  useEffect(() => {
    (async () => {
      try {
        const since14d = new Date(Date.now() - 14 * 86400_000).toISOString();
        const [catsRes, feedRes, evergreenRes, podsRes, entityRes] = await Promise.all([
          supabase.from("categories").select("*").order("sort_order"),
          supabase
            .from("mv_homepage_feed" as any)
            .select("episode_id,title,display_title,slug,summary,description,ai_summary,published_at,audio_url,topics,podcast_id,podcast_slug,podcast_title,podcast_display_title,podcast_image_url,podcast_category,podiverzum_rank,rank_label,rss_status,featured,featured_rank,pod_rank,freshness_bucket")
            .lte("pod_rank", 6)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(HOMEPAGE_EPISODE_LIMIT),
          supabase
            .from("mv_homepage_evergreen" as any)
            .select("episode_id,title,display_title,slug,summary,description,ai_summary,published_at,audio_url,topics,podcast_id,podcast_slug,podcast_title,podcast_display_title,podcast_image_url,podcast_category,podiverzum_rank,rank_label,rss_status,featured")
            .order("podiverzum_rank", { ascending: false, nullsFirst: false })
            .limit(40),
          supabase
            .from("podcasts")
            .select("id,title,display_title,slug,summary,description,image_url,category,apple_url,spotify_url,youtube_url,website_url,featured,featured_rank,rss_status,podiverzum_rank,rank_label,shadow_rank_components")
            .or("featured.eq.true,rank_label.in.(S,A)")
            .not("rss_status", "in", "(failed,inactive)")
            .order("featured", { ascending: false })
            .order("podiverzum_rank", { ascending: false })
            .limit(40),
          supabase
            .from("episodes")
            .select("id,topics,people,companies,podcasts!inner(rss_status,language,rank_label)")
            .gte("published_at", since14d)
            .in("podcasts.rank_label", ["S", "A", "B"])
            .or("language.is.null,language.ilike.en%", { foreignTable: "podcasts" })
            .not("podcasts.rss_status", "in", "(failed,inactive)")
            .limit(1500),
        ]);

        setCats(catsRes.data || []);

        const goodHealth = (p: any) => {
          const hs = (p.shadow_rank_components as any)?.health_state;
          return !hs || hs === "healthy" || hs === "recovered_rss_url";
        };
        const eligible = (podsRes.data || []).filter((p: any) =>
          p.featured || (["S", "A"].includes(p.rank_label) && goodHealth(p))
        );
        setPodcasts(eligible);

        const mapRow = (r: any): FeedEpisode => ({
          id: r.episode_id,
          title: r.title,
          display_title: r.display_title,
          slug: r.slug,
          summary: r.summary,
          ai_summary: r.ai_summary,
          description: r.description,
          published_at: r.published_at,
          audio_url: r.audio_url,
          topics: r.topics,
          freshness_bucket: r.freshness_bucket,
          podcasts: {
            slug: r.podcast_slug,
            title: r.podcast_title,
            display_title: r.podcast_display_title,
            image_url: r.podcast_image_url,
            category: r.podcast_category,
            podiverzum_rank: r.podiverzum_rank,
            rank_label: r.rank_label,
            rss_status: r.rss_status,
            featured: r.featured,
          } as any,
        });

        const eps: FeedEpisode[] = (feedRes.data || []).map(mapRow);

        // Trending = last 14 days (hot+fresh). Fall back to recent (≤30d) if <8 items.
        const hotFresh = eps.filter((e) => e.freshness_bucket === "hot" || e.freshness_bucket === "fresh");
        const trendingPool = hotFresh.length >= 8 ? hotFresh : eps;
        // Diversify: max 2 episodes per podcast in the trending strip so one show
        // can't dominate. Spillover is appended after if we run short of 8 items.
        // Also softly cap divisive categories (e.g. Religion) so the homepage
        // doesn't lead with a category that polarises new visitors.
        const sorted = trendingPool.slice().sort(compareByScore);
        const PER_PODCAST_CAP = 2;
        const SENSITIVE_CATEGORY_CAPS: Record<string, number> = {
          "Religion & Spirituality": 1,
        };
        const counts = new Map<string, number>();
        const catCounts = new Map<string, number>();
        const primary: FeedEpisode[] = [];
        const overflow: FeedEpisode[] = [];
        for (const e of sorted) {
          const key = (e.podcasts as any)?.slug || (e.podcasts as any)?.title || "_";
          const cat = (e.podcasts as any)?.category || "_";
          const n = counts.get(key) || 0;
          const cn = catCounts.get(cat) || 0;
          const catCap = SENSITIVE_CATEGORY_CAPS[cat];
          if (n < PER_PODCAST_CAP && (catCap === undefined || cn < catCap)) {
            primary.push(e);
            counts.set(key, n + 1);
            catCounts.set(cat, cn + 1);
          } else {
            overflow.push(e);
          }
        }
        setTrendingEps([...primary, ...overflow].slice(0, 8));
        setAllEps(eps);

        // Evergreen v0: S-tier, AI-summarized, >30 days old. Diverse by podcast.
        const evergreen: EpisodeLite[] = (evergreenRes.data || []).map(mapRow);
        setEvergreenEps(evergreen.slice(0, 6));

        // Trending entities source (last 14 days, EN-only, healthy podcasts)
        setTrendingEntityEps((entityRes.data || []) as any);
      } catch (err) {
        console.error("Index load failed", err);
        setLoadError(true);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const topPodcasts = useMemo(() => podcasts.slice(0, 12), [podcasts]);

  const epsByCat = useMemo(() => {
    const grouped: Record<string, EpisodeLite[]> = {};
    allEps.forEach((e) => {
      const cat = e.podcasts?.category;
      if (!cat) return;
      (grouped[cat] ||= []).push(e);
    });
    Object.keys(grouped).forEach((k) => {
      const sorted = grouped[k].sort(compareByScore);
      // Same per-podcast cap as trending: max 2 per show within a category strip.
      const counts = new Map<string, number>();
      const primary: EpisodeLite[] = [];
      const overflow: EpisodeLite[] = [];
      for (const e of sorted) {
        const key = (e.podcasts as any)?.slug || (e.podcasts as any)?.title || "_";
        const n = counts.get(key) || 0;
        if (n < 2) { primary.push(e); counts.set(key, n + 1); }
        else overflow.push(e);
      }
      grouped[k] = [...primary, ...overflow].slice(0, 6);
    });
    return grouped;
  }, [allEps]);

  return (
    <Layout>
      <Seo
        title="Podiverzum — Find it. Hear it."
        description="Search podcast episodes by what they actually discuss. People, companies, markets, technologies and ideas — and the conversations worth hearing."
        canonical="https://podiverzum.com/"
        hreflang={[
          { lang: "en", href: "https://podiverzum.com/" },
          { lang: "x-default", href: "https://podiverzum.com/" },
        ]}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Podiverzum",
          url: "https://podiverzum.com",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://podiverzum.com/search?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }}
      />
      <section className="bg-background text-foreground relative border-b border-border overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-background" />
        {/* Brand spotlight */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hero-spot" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
        <div className="relative container mx-auto pt-6 pb-6 sm:pt-6 sm:pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/60 backdrop-blur text-[10px] uppercase tracking-[0.22em] text-muted-foreground shadow-sm animate-fade-up">
            Podcast discovery
          </div>
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight max-w-4xl mt-4 sm:mt-6 leading-[1.02] animate-fade-up">
            Find it. <span className="text-brand-gradient">Hear it.</span>
          </h1>
          <p className="text-foreground/90 mt-4 sm:mt-6 max-w-2xl text-base sm:text-lg leading-relaxed animate-fade-up font-medium">
            Search podcast episodes by what they actually discuss.
          </p>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm sm:text-base leading-relaxed animate-fade-up">
            Ask about people, companies, markets, technologies or ideas — and find the conversations worth hearing.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); }}
            className="mt-6 sm:mt-10 max-w-2xl relative focus-brand rounded-2xl transition-shadow animate-fade-up"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={heroPlaceholder}
              className="w-full pl-12 pr-24 sm:pr-32 py-3.5 sm:py-4 rounded-2xl bg-card/80 backdrop-blur border border-border focus:border-primary/50 outline-none text-base placeholder:text-muted-foreground/60 shadow-elevated"
            />
            <button className="btn-brand absolute right-2 top-1/2 -translate-y-1/2 px-4 sm:px-5 py-2 rounded-xl text-sm font-semibold">
              Search
            </button>
          </form>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-2">
            <div className="flex flex-nowrap items-center gap-2 min-w-0">
              {visibleChips.map((c, i) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => nav(`/search?q=${encodeURIComponent(c.query)}`)}
                  className={`chip whitespace-nowrap shrink-0 animate-fade-up ${
                    i >= 3 ? "!hidden sm:!inline-flex" : ""
                  } ${i >= 4 ? "sm:!hidden lg:!inline-flex" : ""}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <span className="sm:ml-auto sm:pl-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 whitespace-nowrap shrink-0">
              700,000+ indexed episodes
            </span>
          </div>
        </div>
        {/* bottom rule */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </section>

      <div className="container mx-auto pt-4 pb-8 sm:pt-4 sm:pb-12 space-y-8 sm:space-y-10">
        <AskPodiverzum />
        <ContinueListening />
        {!loaded && trendingEps.length === 0 && (
          <section>
            <Skeleton className="h-6 w-48 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-4 border border-border/50 rounded-xl">
                  <Skeleton className="h-16 w-16 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {trendingEps.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Worth hearing now</h2>
                <p className="text-xs text-muted-foreground mt-1">Recent episodes across shows.</p>
              </div>
            </div>
            <div className="hidden md:grid md:grid-cols-2 gap-4">
              <EpisodeList items={trendingEps.slice(0, 3)} />
              {trendingEps.length > 3 && (
                <EpisodeList items={trendingEps.slice(3, 6)} />
              )}
            </div>
            <div className="md:hidden">
              <EpisodeList items={trendingEps} scrollOnMobile />
            </div>
          </section>
        )}

        <MoodCollections />

        {trendingEntityEps.length > 0 && (
          <TrendingEntities
            eyebrow="Topics"
            title="What people are talking about"
            subtitle="Topics surfacing across recent episodes."
            items={topEntitiesFrom(trendingEntityEps, "topics", "topic", 10)}
            icon="topic"
          />
        )}

        {trendingEntityEps.length > 0 && (
          <TrendingEntities
            eyebrow="People"
            title="Names in the conversation"
            subtitle="Founders, scientists, leaders, athletes — who's coming up."
            items={topEntitiesFrom(trendingEntityEps, "people", "person", 10)}
            icon="person"
          />
        )}

        {trendingEntityEps.length > 0 && (() => {
          const companies = topEntitiesFrom(trendingEntityEps, "companies", "company", 10);
          return companies.length ? (
            <TrendingEntities
              eyebrow="Companies"
              title="Companies in the room"
              subtitle="Brands and organizations showing up across shows."
              items={companies}
              icon="company"
            />
          ) : null;
        })()}

        {(() => {
          const populated = cats
            .filter((c) => c.slug !== "trending" && (epsByCat[c.name]?.length ?? 0) > 0)
            .sort((a, b) => (epsByCat[b.name]?.length ?? 0) - (epsByCat[a.name]?.length ?? 0))
            .slice(0, 3);
          return populated.map((c, idx) => {
            const items = epsByCat[c.name] || [];
            const tinted = idx % 2 === 1;
            return (
              <section key={c.id} className={tinted ? "rounded-2xl bg-card/40 border border-border/60 p-5 sm:p-6" : ""}>
                <div className="flex items-end justify-between mb-1">
                  <h2 className="text-xl sm:text-2xl font-semibold">{c.name}</h2>
                  <Link to={`/category/${c.slug}`} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    See more episodes <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground mb-4">Recent in {c.name}</p>
                {(() => {
                  const mid = Math.ceil(items.length / 2);
                  const left = items.slice(0, mid);
                  const right = items.slice(mid);
                  return (
                    <>
                      <div className="hidden md:grid md:grid-cols-2 gap-4">
                        <EpisodeList items={left} />
                        {right.length > 0 && <EpisodeList items={right} />}
                      </div>
                      <div className="md:hidden">
                        <EpisodeList items={items} scrollOnMobile />
                      </div>
                    </>
                  );
                })()}
              </section>
            );
          });
        })()}

        <div className="flex justify-center">
          <Link
            to="/categories"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border bg-card/60 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            Browse all categories <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {evergreenEps.length > 0 && (
          <section className="rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-6">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold">Still worth hearing</h2>
                <p className="text-xs text-muted-foreground mt-1">Older episodes that hold up.</p>
              </div>
            </div>
            <div className="hidden md:grid md:grid-cols-2 gap-4">
              <EpisodeList items={evergreenEps.slice(0, Math.ceil(evergreenEps.length / 2))} />
              {evergreenEps.length > 1 && (
                <EpisodeList items={evergreenEps.slice(Math.ceil(evergreenEps.length / 2))} />
              )}
            </div>
            <div className="md:hidden">
              <EpisodeList items={evergreenEps} scrollOnMobile />
            </div>
          </section>
        )}

        {topPodcasts.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold">Strong sources</h2>
                <p className="text-xs text-muted-foreground mt-1">Shows that consistently land.</p>
              </div>
              <Link to="/categories" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Browse all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {topPodcasts.slice(0, 4).map((p) => <PodcastCard key={p.id} p={p} />)}
            </div>
          </section>
        )}

        <RecentlyAddedPodcasts limit={4} />

        {loaded && !trendingEps.length && !topPodcasts.length && (
          <div className="text-center py-20 text-muted-foreground">
            {loadError
              ? "Episodes are temporarily unavailable. Please refresh shortly."
              : "Featured episodes are temporarily unavailable."}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Index;
