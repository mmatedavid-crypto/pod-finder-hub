import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { PodcastCard, PodcastLite } from "@/components/PodcastCard";
import { EpisodeList, EpisodeLite } from "@/components/EpisodeCard";
import { Seo } from "@/components/Seo";
import { breadcrumbJsonLd, siteOrigin } from "@/lib/seo-helpers";
import NotFoundState from "@/components/NotFoundState";
import { ArrowRight, Layers, Radio, Search, Sparkles } from "lucide-react";
import { searchEpisodes, MATCH_LABEL, SearchScope } from "@/lib/search";
import { compareByScore } from "@/lib/episodeRank";

const CAT_GRADIENTS: Record<string, string> = {
  news: "from-red-500/20 to-orange-500/20",
  business: "from-emerald-500/20 to-teal-500/20",
  technology: "from-blue-500/20 to-indigo-500/20",
  science: "from-cyan-500/20 to-blue-500/20",
  health: "from-rose-500/20 to-red-500/20",
  sports: "from-green-500/20 to-emerald-600/20",
  culture: "from-purple-500/20 to-indigo-500/20",
  comedy: "from-yellow-400/20 to-orange-500/20",
};

export default function CategoryDetail() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const queryParam = params.get("q") || "";
  const scopeParam = (params.get("scope") as SearchScope) || "category";

  const [cat, setCat] = useState<any>(null);
  const [podcasts, setPodcasts] = useState<PodcastLite[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeLite[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Search state
  const [q, setQ] = useState(queryParam);
  const [searchLoading, setSearchLoading] = useState(false);
  const [inCat, setInCat] = useState<EpisodeLite[]>([]);
  const [outside, setOutside] = useState<EpisodeLite[]>([]);
  const [allResults, setAllResults] = useState<EpisodeLite[]>([]);
  const [semanticUsed, setSemanticUsed] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => { setQ(queryParam); }, [queryParam]);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data: c } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
      setCat(c);
      setLoading(false);
      if (!c) return;
      const { data: ps } = await supabase
        .from("podcasts")
        .select("id,title,display_title,slug,summary,description,image_url,category,apple_url,spotify_url,youtube_url,website_url,featured,rss_status,podiverzum_rank,rank_label,shadow_rank_components,language")
        .eq("category", c.name)
        // EN-only site: exclude non-English podcasts (HU/etc). NULL language treated as EN
        // since the legacy corpus is overwhelmingly English-but-untagged.
        .or("language.is.null,language.ilike.en%")
        .order("featured", { ascending: false })
        .order("podiverzum_rank", { ascending: false })
        .limit(80);
      const goodHealth = (p: any) => {
        const hs = (p.shadow_rank_components as any)?.health_state;
        return !hs || hs === "healthy" || hs === "recovered_rss_url";
      };
      const visible = (ps || []).filter((p: any) =>
        p.featured || (goodHealth(p) && p.rss_status !== "failed" && p.rss_status !== "inactive" && !["D", "E"].includes(p.rank_label))
      );
      const ids0 = visible.map((p: any) => p.id);
      const epCountMap: Record<string, number> = {};
      if (ids0.length) {
        const { data: ec } = await supabase.from("episodes").select("podcast_id").in("podcast_id", ids0);
        (ec || []).forEach((e: any) => { epCountMap[e.podcast_id] = (epCountMap[e.podcast_id] || 0) + 1; });
      }
      const high = visible.filter((p: any) => p.featured || (["S", "A"].includes(p.rank_label) && (epCountMap[p.id] || 0) > 0));
      const mid = visible.filter((p: any) => !p.featured && p.rank_label === "B" && (epCountMap[p.id] || 0) > 0);
      const low = visible.filter((p: any) => !p.featured && p.rank_label === "C" && (epCountMap[p.id] || 0) > 0);
      const promotedPodcasts = (high.length >= 6 ? high : [...high, ...mid, ...low]).slice(0, 12);
      setPodcasts(promotedPodcasts);

      const promotedIds = promotedPodcasts.map((p: any) => p.id);
      if (promotedIds.length) {
        const { data: eps } = await supabase
          .from("episodes")
          .select("id,title,display_title,slug,summary,description,published_at,audio_url,topics,podcasts!inner(slug,title,display_title,image_url,category,podiverzum_rank,rank_label)")
          .in("podcast_id", promotedIds)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(80);
        const sorted = (eps || []).slice().sort(compareByScore).slice(0, 25);
        setEpisodes(sorted as any);
        const t = new Map<string, number>();
        (sorted || []).forEach((e: any) => (e.topics || []).forEach((x: string) => t.set(x, (t.get(x) || 0) + 1)));
        setTopics([...t.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k));
      }
    })();
  }, [slug]);

  // Run query-time search when there is a query.
  useEffect(() => {
    if (!cat || !queryParam) {
      setInCat([]); setOutside([]); setAllResults([]); setSemanticUsed(false); setSuggestion(null);
      return;
    }
    setSearchLoading(true);
    (async () => {
      const r = await searchEpisodes({ rawQuery: queryParam, scope: scopeParam, categoryName: cat.name, limit: 60, language: "en" });
      setSemanticUsed(r.semanticUsed);
      setSuggestion(r.suggestion);
      const decorate = (arr: any[]) => arr.map((x) => ({ ...x.e, matchBadge: MATCH_LABEL[x.matchType] || "matched result" })) as EpisodeLite[];
      setInCat(decorate(r.inCategory));
      setOutside(decorate(r.outsideCategory));
      setAllResults(decorate(r.all));
      setSearchLoading(false);
    })();
  }, [cat, queryParam, scopeParam]);

  const flatTerms = useMemo(() => queryParam.trim().split(/\s+/).filter((t) => t.length >= 2), [queryParam]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (q.trim()) next.set("q", q.trim()); else next.delete("q");
    if (!next.has("scope")) next.set("scope", "category");
    setParams(next);
  };
  const setScope = (s: SearchScope) => {
    const next = new URLSearchParams(params);
    next.set("scope", s);
    if (queryParam) next.set("q", queryParam);
    setParams(next);
  };

  if (loading) return <Layout><div className="container mx-auto py-20 text-muted-foreground">Loading…</div></Layout>;
  if (!cat) return <NotFoundState title="Category not found" message="That category doesn't exist or has been removed." />;

  const catUrl = `${siteOrigin()}/category/${cat.slug || slug}`;
  const categoryGradient = CAT_GRADIENTS[cat.slug] || "from-primary/15 to-card";
  return (
    <Layout>
      <Seo
        title={cat.seo_title || `${cat.name} podcast episodes — Podiverzum`}
        description={cat.seo_description || `Discover the latest podcast episodes in ${cat.name}, ranked by relevance, freshness and source quality.`}
        canonical={catUrl}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${cat.name} podcast episodes`,
            about: { "@type": "Thing", name: cat.name },
            url: catUrl,
          },
          breadcrumbJsonLd([
            { name: "Home", url: `${siteOrigin()}/` },
            { name: "Categories", url: `${siteOrigin()}/categories` },
            { name: cat.name, url: catUrl },
          ]),
        ]}
      />
      <section className="relative border-b border-border bg-background overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 hero-spot opacity-80" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="relative container mx-auto py-10 sm:py-14 max-w-6xl px-4">
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-gradient-to-br ${categoryGradient}`}>
            <Layers className="h-5 w-5 text-foreground/80" />
          </div>
          <div className="mt-5 text-[10px] uppercase tracking-[0.22em] text-primary font-semibold">Category</div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mt-2">{cat.name}</h1>
          <p className="text-foreground/80 mt-4 max-w-2xl leading-relaxed">
            {cat.description || `Latest podcast episodes in ${cat.name}, ranked by relevance, freshness and source quality.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <span className="rounded-full border border-border bg-card/70 px-3 py-1">{episodes.length} highlighted episodes</span>
            <span className="rounded-full border border-border bg-card/70 px-3 py-1">{podcasts.length} strong sources</span>
            {topics.length > 0 && <span className="rounded-full border border-border bg-card/70 px-3 py-1">{topics.length} recurring topics</span>}
          </div>
        </div>
      </section>

      <div className="container mx-auto py-8 sm:py-10 max-w-6xl px-4">
        <section className="rounded-xl border border-border bg-card/70 p-4 sm:p-5 shadow-elevated">
          <div className="flex items-center gap-2 mb-3">
            <Search className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Search within {cat.name}</h2>
          </div>
          <form onSubmit={submitSearch} className="relative max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${cat.name} episodes...`}
              className="w-full pl-10 pr-24 py-3 rounded-md bg-background border border-border focus:border-accent outline-none"
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm">
              Search
            </button>
          </form>
          <div className="flex flex-wrap gap-2 items-center mt-3 text-xs">
            <span className="text-muted-foreground">Scope:</span>
            {([["category", `This category`], ["all", "All Podiverzum"]] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setScope(k)}
                className={`px-2.5 py-1 rounded-full border ${scopeParam === k ? "bg-foreground text-background border-foreground" : "bg-background border-border hover:border-foreground/40"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        {queryParam ? (
          <div className="mt-8 space-y-10">
            {searchLoading && <div className="text-sm text-muted-foreground">Searching…</div>}

            {scopeParam === "category" && (
              <>
                <section>
                  <h2 className="font-semibold mb-3 flex items-center gap-2 flex-wrap">
                    Best matches in {cat.name} ({inCat.length})
                    {suggestion && suggestion.toLowerCase() !== queryParam.toLowerCase() && (
                      <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        Showing results for {suggestion}
                      </span>
                    )}
                    {semanticUsed && (
                      <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-foreground/70">
                        including related ideas
                      </span>
                    )}
                  </h2>
                  {inCat.length > 0 ? (
                    <>
                      <EpisodeList items={inCat} terms={flatTerms} showEntities scrollAlways />
                    </>
                  ) : (
                    <div className="p-6 border border-border rounded-lg bg-card text-sm text-muted-foreground">
                      No matches in {cat.name}. Try “All Podiverzum” to broaden the search.
                    </div>
                  )}
                </section>
                {outside.length > 0 && (
                  <section>
                    <h2 className="font-semibold mb-3 flex items-center gap-2 flex-wrap">
                      Strong matches outside {cat.name} ({outside.length})
                      <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        outside this category
                      </span>
                    </h2>
                    <EpisodeList items={outside} terms={flatTerms} showEntities scrollAlways />
                  </section>
                )}
              </>
            )}

            {scopeParam === "all" && (
              <section>
                <h2 className="font-semibold mb-3 flex items-center gap-2 flex-wrap">
                  Matching episodes ({allResults.length})
                  {suggestion && suggestion.toLowerCase() !== queryParam.toLowerCase() && (
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      Showing results for {suggestion}
                    </span>
                  )}
                  {semanticUsed && (
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-foreground/70">
                      including related ideas
                    </span>
                  )}
                </h2>
                <EpisodeList items={allResults} terms={flatTerms} showEntities scrollAlways />
              </section>
            )}
          </div>
        ) : (
          <>
            <div className="mt-10 flex items-end justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-primary/90 mb-1">
                  <Sparkles className="h-3 w-3" /> Fresh picks
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold">Latest episodes in {cat.name}</h2>
                <p className="text-xs text-muted-foreground mt-1">A fast rail of recent, high-quality conversations.</p>
              </div>
            </div>
            {episodes.length > 0 ? (
              <div className="mt-4"><EpisodeList items={episodes} showTopics scrollAlways /></div>
            ) : (
              <div className="mt-4 p-6 border border-border rounded-lg bg-card text-sm text-muted-foreground">
                No podcasts indexed in this category yet.
              </div>
            )}

            {topics.length > 0 && (
              <section className="mt-10 rounded-xl border border-border bg-card/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-xl font-semibold">Popular topics</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {topics.map((t) => (
                    <Link key={t} to={`/topic/${encodeURIComponent(t.toLowerCase().replace(/[^a-z0-9]+/g,"-"))}`} className="px-3 py-1 rounded-full bg-secondary text-sm hover:bg-accent hover:text-accent-foreground">
                      {t}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {podcasts.length > 0 && (
              <section className="mt-10">
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
                      <Radio className="h-3 w-3" /> Sources
                    </div>
                    <h2 className="text-xl sm:text-2xl font-semibold">Top podcasts in {cat.name}</h2>
                  </div>
                  <Link to="/categories" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    All categories <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {podcasts.map((p) => <PodcastCard key={p.id} p={p} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
