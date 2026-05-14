import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { EpisodeList, EpisodeLite } from "@/components/EpisodeCard";
import { PodcastCard, PodcastLite } from "@/components/PodcastCard";
import { Seo } from "@/components/Seo";
import { siteOrigin } from "@/lib/seo-helpers";
import NotFoundState from "@/components/NotFoundState";
import { ENTITY_COLUMN, ENTITY_LABEL, EntityKind, matchesEntitySlug } from "@/lib/entity";
import { compareByScore, episodeScore } from "@/lib/episodeRank";

const NOINDEX_BELOW = 5;
const RICH_AT = 20;

type AppearanceStats = { host?: number; guest?: number; mentioned?: number; total?: number };
type EntityProfile = {
  display_name: string;
  bio: string | null;
  episodes_summary: string | null;
  updated_at: string;
  featured_episode_ids?: string[] | null;
  appearance_stats?: AppearanceStats | null;
};

export default function EntityPage({ kind }: { kind: EntityKind }) {
  const { slug = "" } = useParams();
  const decoded = useMemo(() => decodeURIComponent(slug), [slug]);
  const [eps, setEps] = useState<EpisodeLite[]>([]);
  const [pods, setPods] = useState<PodcastLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string>(decoded);
  const [related, setRelated] = useState<{ kind: EntityKind; v: string; n: number }[]>([]);
  const [profile, setProfile] = useState<EntityProfile | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const col = ENTITY_COLUMN[kind];
      // Server-side entity match (handles diacritics/casing). Then fetch joined podcast data.
      const { data: rpcRows } = await supabase.rpc("episodes_by_entity" as any, {
        p_kind: kind, p_slug: decoded, p_limit: 200,
      });
      const baseEps: any[] = Array.isArray(rpcRows) ? rpcRows : [];
      const podIdsAll = Array.from(new Set(baseEps.map((e: any) => e.podcast_id))).filter(Boolean);
      let podMap2 = new Map<string, any>();
      if (podIdsAll.length) {
        const { data: ps } = await supabase
          .from("podcasts")
          .select("id,slug,title,display_title,image_url,category,podiverzum_rank,rank_label,rss_status,featured")
          .in("id", podIdsAll);
        (ps || []).forEach((p: any) => podMap2.set(p.id, p));
      }
      const matches: any[] = [];
      let exemplar = decoded;
      baseEps.forEach((e: any) => {
        const podcasts = podMap2.get(e.podcast_id);
        if (!podcasts) return;
        const arr: string[] = e[col] || [];
        const hit = arr.find((v) => matchesEntitySlug(kind, v, decoded));
        if (exemplar === decoded && hit) exemplar = hit;
        matches.push({ ...e, podcasts });
      });
      // Filter out broken parent feeds
      const visible = matches.filter((e) => {
        const ps = e.podcasts;
        return ps && ps.rss_status !== "failed" && ps.rss_status !== "inactive";
      });
      setDisplayName(exemplar);

      // Composite tier+freshness sort; latest first secondary
      const sorted = visible.slice().sort(compareByScore);
      setEps(sorted.slice(0, 40) as any);

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
      } else {
        setPods([]);
      }

      // Related entities (co-occurring)
      const co: { kind: EntityKind; v: string; n: number }[] = [];
      const tally = new Map<string, { kind: EntityKind; v: string; n: number }>();
      visible.forEach((e: any) => {
        (Object.keys(ENTITY_COLUMN) as EntityKind[]).forEach((k) => {
          if (k === kind) return;
          const arr: string[] = e[ENTITY_COLUMN[k]] || [];
          arr.forEach((v) => {
            const key = `${k}:${v.toLowerCase()}`;
            const cur = tally.get(key);
            if (cur) cur.n++; else tally.set(key, { kind: k, v, n: 1 });
          });
        });
      });
      tally.forEach((x) => co.push(x));
      setRelated(co.sort((a, b) => b.n - a.n).slice(0, 16));

      setLoading(false);
    })();
  }, [kind, slug, decoded]);

  // Fetch (or trigger generation of) the AI bio + episode summary.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("entity_profiles")
        .select("display_name,bio,episodes_summary,updated_at,featured_episode_ids,appearance_stats")
        .eq("kind", kind)
        .eq("slug", decoded.toLowerCase())
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setProfile(data as EntityProfile);
        const ageDays = (Date.now() - new Date(data.updated_at).getTime()) / 86400_000;
        if (ageDays > 30) {
          supabase.functions.invoke("entity-profile-generate", { body: { kind, slug: decoded.toLowerCase() } }).catch(() => {});
        }
      } else {
        supabase.functions.invoke("entity-profile-generate", { body: { kind, slug: decoded.toLowerCase() } }).catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [kind, slug, decoded]);

  const total = eps.length;
  const noindex = total > 0 && total < NOINDEX_BELOW;
  const entityType =
    kind === "person" ? "Person" :
    kind === "company" ? "Organization" :
    kind === "ticker" ? "Corporation" :
    "Thing";
  const pageUrl = `${siteOrigin()}/${kind}/${slug}`;
  const rich = total >= RICH_AT;

  const featuredIdSet = useMemo(
    () => new Set(profile?.featured_episode_ids || []),
    [profile?.featured_episode_ids]
  );
  // Heuristic: if the entity name appears in the episode title, treat as "featured"
  // even if the AI curation hasn't picked it yet. Avoids putting obvious direct
  // episodes into the "Also mentioning" bucket.
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nameTokens = useMemo(() => {
    const parts = norm(displayName).split(/\s+/).filter((t) => t.length >= 3);
    return parts;
  }, [displayName]);
  const titleHitsEntity = (e: EpisodeLite) => {
    const title = norm((e as any).title || "");
    if (!title || nameTokens.length === 0) return false;
    // For multi-word names (e.g., "Gabor Maté"), require ALL tokens present.
    // For single-token names, the lone token must appear.
    return nameTokens.every((t) => title.includes(t));
  };
  const effectiveFeaturedIds = useMemo(() => {
    const set = new Set(featuredIdSet);
    eps.forEach((e) => { if (titleHitsEntity(e)) set.add((e as any).id); });
    return set;
  }, [eps, featuredIdSet, nameTokens]);
  const featuredEps = useMemo(() => (
    effectiveFeaturedIds.size
      ? eps.filter((e) => effectiveFeaturedIds.has((e as any).id))
          .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime())
          .slice(0, 12)
      : []
  ), [eps, effectiveFeaturedIds]);
  const mentionedEps = useMemo(() => (
    effectiveFeaturedIds.size ? eps.filter((e) => !effectiveFeaturedIds.has((e as any).id)) : eps
  ), [eps, effectiveFeaturedIds]);
  const newest = useMemo(() => (
    mentionedEps.slice().sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime()).slice(0, 12)
  ), [mentionedEps]);
  const best = useMemo(() => (
    mentionedEps.slice().sort((a, b) => episodeScore(b) - episodeScore(a)).slice(0, 12)
  ), [mentionedEps]);

  if (loading) return <Layout><div className="container mx-auto py-20 text-muted-foreground">Loading…</div></Layout>;

  if (!eps.length) return (
    <NotFoundState
      title={`No episodes about ${displayName}`}
      message={`Podiverzum hasn't indexed enough podcast episodes about ${displayName} yet. Try the search instead.`}
    />
  );


  const last30Count = eps.filter((e) => {
    if (!e.published_at) return false;
    return Date.now() - new Date(e.published_at).getTime() < 30 * 86400_000;
  }).length;
  const speakerStats = profile?.appearance_stats;
  const speakerCount = (speakerStats?.host || 0) + (speakerStats?.guest || 0);

  return (
    <Layout>
      <Seo
        title={`Podcast episodes about ${displayName} — Podiverzum`}
        description={`Discover podcast episodes about ${displayName}, ranked by relevance, freshness and source quality.`}
        canonical={pageUrl}
        noindex={noindex}
        jsonLd={noindex ? undefined : [
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `Podcast episodes about ${displayName}`,
            url: pageUrl,
            about: { "@type": entityType, name: displayName, ...(profile?.bio ? { description: profile.bio } : {}) },
          },
          {
            "@context": "https://schema.org",
            "@type": entityType,
            name: displayName,
            url: pageUrl,
            ...(profile?.bio ? { description: profile.bio } : {}),
          },
        ]}
      />
      {/* Hero */}
      <section className="border-b border-border bg-background relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 hero-spot opacity-50" />
        <div className="container mx-auto py-12 sm:py-14 max-w-5xl relative">
          <div className="text-[10px] uppercase tracking-[0.22em] text-primary">{ENTITY_LABEL[kind]}</div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-2 leading-[1.05]">{displayName}</h1>
          {profile?.bio ? (
            <p className="text-foreground/90 mt-4 max-w-2xl text-[15px] leading-relaxed">
              {profile.bio}
            </p>
          ) : (
            <p className="text-muted-foreground mt-3 max-w-2xl">
              Podcast coverage of <span className="text-foreground font-medium">{displayName}</span> across shows. Ranked by relevance, freshness and source quality.
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Stat label="Episodes indexed" value={total} />
            <Stat label="Last 30 days" value={last30Count} />
            <Stat label="Podcasts" value={pods.length} />
          </div>
          {profile?.episodes_summary && (
            <div className="mt-7 max-w-3xl rounded-2xl border border-border/70 bg-card/60 p-5 sm:p-6">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">Overview</div>
              <p className="text-sm sm:text-[15px] leading-relaxed text-foreground/85">{profile.episodes_summary}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-3">Drawn from indexed episodes that mention this topic.</p>
            </div>
          )}
        </div>
      </section>

      <div className="container mx-auto py-10 max-w-5xl space-y-12">
        {featuredEps.length > 0 && (
          <section className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-5 sm:p-6">
            <div className="mb-3">
              <h2 className="text-xl font-semibold">
                Featuring {displayName}
                <span className="ml-2 text-xs font-normal text-muted-foreground align-middle">
                  {kind === "person" ? "as guest or main subject" : "as primary subject"}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {speakerCount > 0
                  ? `${speakerCount} episode${speakerCount === 1 ? "" : "s"} where ${displayName} actually speaks.`
                  : `Episodes built around ${displayName}.`}
              </p>
            </div>
            <EpisodeList items={featuredEps} showEntities />
          </section>
        )}

        <section>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-xl font-semibold">
                {featuredEps.length > 0 ? `Also mentioning ${displayName}` : "Latest episodes"}
              </h2>
              {featuredEps.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Episodes that discuss {displayName} but where they don't appear directly.</p>
              )}
            </div>
          </div>
          <EpisodeList items={newest} showEntities />
        </section>

        {rich && (
          <section className="rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-6">
            <div className="mb-3">
              <h2 className="text-xl font-semibold">Episodes worth hearing</h2>
              <p className="text-xs text-muted-foreground mt-1">Strong matches across the index.</p>
            </div>
            <EpisodeList items={best} showEntities />
          </section>
        )}

        {pods.length > 0 && (
          <section>
            <div className="mb-3">
              <h2 className="text-xl font-semibold">Podcasts covering {displayName}</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pods.map((p) => <PodcastCard key={p.id} p={p} />)}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section>
            <div className="mb-3">
              <h2 className="text-xl font-semibold">Related</h2>
              <p className="text-xs text-muted-foreground mt-1">People, companies and topics that show up alongside {displayName}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {related.map(({ kind: k, v }) => {
                const s = k === "ticker" ? v.replace(/[^a-zA-Z0-9.]+/g,"").toUpperCase() : v.toLowerCase().replace(/[^a-z0-9]+/g,"-");
                return (
                  <Link
                    key={`${k}-${v}`}
                    to={`/${k}/${encodeURIComponent(s)}`}
                    className="px-3 py-1.5 rounded-full border border-border bg-card text-sm hover:border-primary/50 hover:bg-primary/10 hover:text-foreground transition-colors inline-flex items-center gap-1.5"
                  >
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

