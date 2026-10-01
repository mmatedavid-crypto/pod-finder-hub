import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { EpisodeList, EpisodeLite } from "@/components/EpisodeCard";
import { PodcastCard, PodcastLite } from "@/components/PodcastCard";
import { Seo } from "@/components/Seo";
import { siteOrigin } from "@/lib/seo-helpers";
import NotFoundState from "@/components/NotFoundState";
import { ENTITY_COLUMN, ENTITY_LABEL, EntityKind, matchesEntitySlug, classifyEntityMatch, getPersonRole, PersonRole } from "@/lib/entity";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { compareByScore, episodeScore } from "@/lib/episodeRank";
import TemporarilyUnavailable from "@/components/TemporarilyUnavailable";
import { ENTITY_EP_SELECT, isVisibleEpisode, loadEntityEpisodes } from "@/lib/entityEpisodes";

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
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setEps([]);
    setPods([]);
    setRelated([]);
    setDisplayName(decoded);
    setFailed(false);
    setLoading(true);
    (async () => {
      const col = ENTITY_COLUMN[kind];
      // 1) Cached episode_ids from entity_profiles (bounded, fast).
      const { data: prof } = await supabase
        .from("entity_profiles")
        .select("display_name,episode_ids")
        .eq("kind", kind)
        .eq("slug", decoded.toLowerCase())
        .maybeSingle();
      if (cancelled) return;
      const cachedIds: string[] = (prof as any)?.episode_ids || [];

      // 2) Live lookup. `people` has a GIN index, so persons use an indexed overlap
      //    on likely stored spellings; other kinds keep the server-side slug match RPC.
      const fromSlug = decoded.replace(/-/g, " ").trim();
      const variants = Array.from(new Set([
        (prof as any)?.display_name, fromSlug, fromSlug.toLowerCase(),
        fromSlug.replace(/\b\w/g, (c) => c.toUpperCase()),
      ].filter(Boolean))) as string[];
      const live = kind === "person"
        ? () => supabase
            .from("episodes")
            .select(ENTITY_EP_SELECT)
            .overlaps(col, variants)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(200)
        : async () => {
            const r = await supabase.rpc("episodes_by_entity" as any, { p_kind: kind, p_slug: decoded, p_limit: 200 });
            if (r.error) return { data: null, error: r.error };
            const base: any[] = Array.isArray(r.data) ? r.data : [];
            const pids = Array.from(new Set(base.map((e: any) => e.podcast_id))).filter(Boolean);
            if (!pids.length) return { data: [], error: null };
            const pr = await supabase
              .from("podcasts")
              .select("id,slug,title,display_title,image_url,category,podiverzum_rank,rank_label,rss_status,featured,language")
              .in("id", pids);
            if (pr.error) return { data: null, error: pr.error };
            const pm = new Map((pr.data || []).map((p: any) => [p.id, p]));
            return { data: base.map((e: any) => ({ ...e, podcasts: pm.get(e.podcast_id) })), error: null };
          };

      // The live lookup is expensive on large entities, so it only runs when no
      // cached list exists; entity-profile-generate / the daily profile runner
      // refresh episode_ids (pages older than 30 days also trigger a regen).
      const { rows, failed: loadFailed } = await loadEntityEpisodes({ cachedIds, live: cachedIds.length ? undefined : live });
      if (cancelled) return;
      if (loadFailed) { setFailed(true); setLoading(false); return; }

      let exemplar = decoded;
      rows.forEach((e: any) => {
        if (exemplar !== decoded) return;
        const arr: string[] = e[col] || [];
        const hit = arr.find((v) => matchesEntitySlug(kind, v, decoded));
        if (hit) exemplar = hit;
      });
      // Healthy, English parent feeds only
      const visible = rows.filter(isVisibleEpisode);
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
        if (cancelled) return;
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
    return () => { cancelled = true; };
  }, [kind, slug, decoded, reloadKey]);

  // Fetch (or trigger generation of) the AI bio + episode summary.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setProfile(null);
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

  // Position-based classification: Strong (title) / Medium (summary or top-of-array) / Weak.
  // Any AI-curated "featured" episode is promoted to Strong regardless of position.
  // For person pages we *also* compute a role from people_roles (v2 extraction).
  const strengthById = useMemo(() => {
    const map = new Map<string, 1 | 2 | 3>();
    eps.forEach((e) => {
      const s = classifyEntityMatch(e as any, kind, displayName);
      map.set((e as any).id, featuredIdSet.has((e as any).id) ? 3 : s);
    });
    return map;
  }, [eps, kind, displayName, featuredIdSet]);

  // Person-only: role from people_roles JSONB (v2). Falls back to position-based bucketing.
  const roleById = useMemo(() => {
    const map = new Map<string, PersonRole | null>();
    if (kind !== "person") return map;
    eps.forEach((e) => {
      map.set((e as any).id, getPersonRole(e as any, displayName));
    });
    return map;
  }, [eps, kind, displayName]);

  // Person role-aware buckets. Episodes without v2 data fall back to positional strength.
  const subjectEps = useMemo(
    () => kind !== "person" ? [] : eps
      .filter((e) => {
        const r = roleById.get((e as any).id);
        if (r === "subject") return true;
        // v1 fallback: if no role, use positional Strong as subject-equivalent
        if (r == null) return strengthById.get((e as any).id) === 3;
        return false;
      })
      .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime())
      .slice(0, 24),
    [kind, eps, roleById, strengthById],
  );
  const guestEps = useMemo(
    () => kind !== "person" ? [] : eps
      .filter((e) => roleById.get((e as any).id) === "guest")
      .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime())
      .slice(0, 18),
    [kind, eps, roleById],
  );
  const hostEps = useMemo(
    () => kind !== "person" ? [] : eps
      .filter((e) => roleById.get((e as any).id) === "host")
      .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime())
      .slice(0, 18),
    [kind, eps, roleById],
  );
  const mentionedEps = useMemo(
    () => kind !== "person" ? [] : eps
      .filter((e) => {
        const r = roleById.get((e as any).id);
        if (r === "mentioned") return true;
        // v1 fallback for mentions: positional Weak/Medium when no v2 data
        if (r == null) return strengthById.get((e as any).id) !== 3;
        return false;
      })
      .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime())
      .slice(0, 24),
    [kind, eps, roleById, strengthById],
  );

  // Non-person buckets keep the existing positional buckets.
  const strongEps = useMemo(
    () => kind === "person" ? [] : eps
      .filter((e) => strengthById.get((e as any).id) === 3)
      .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime())
      .slice(0, 18),
    [kind, eps, strengthById],
  );
  const mediumEps = useMemo(
    () => kind === "person" ? [] : eps
      .filter((e) => strengthById.get((e as any).id) === 2)
      .sort(compareByScore)
      .slice(0, 18),
    [kind, eps, strengthById],
  );
  const weakEps = useMemo(
    () => kind === "person" ? [] : eps
      .filter((e) => strengthById.get((e as any).id) === 1)
      .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime())
      .slice(0, 24),
    [kind, eps, strengthById],
  );

  if (failed) return <TemporarilyUnavailable label={displayName} onRetry={() => setReloadKey((k) => k + 1)} />;
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
        {/* PERSON: role-aware sections (v2). Falls back to positional buckets for entities not yet re-extracted. */}
        {kind === "person" && hostEps.length > 0 && (
          <section className="sm:rounded-2xl sm:border sm:border-primary/30 sm:bg-primary/[0.04] sm:p-6">
            <div className="mb-3">
              <h2 className="text-xl font-semibold">Hosted by {displayName}</h2>
              <p className="text-xs text-muted-foreground mt-1">Episodes where {displayName} is the host of the show.</p>
            </div>
            <EpisodeList items={hostEps} showEntities />
          </section>
        )}

        {kind === "person" && guestEps.length > 0 && (
          <section className="sm:rounded-2xl sm:border sm:border-primary/30 sm:bg-primary/[0.04] sm:p-6">
            <div className="mb-3">
              <h2 className="text-xl font-semibold">Appears as guest</h2>
              <p className="text-xs text-muted-foreground mt-1">Interviews and conversations where {displayName} speaks.</p>
            </div>
            <EpisodeList items={guestEps} showEntities />
          </section>
        )}

        {kind === "person" && subjectEps.length > 0 && (
          <section>
            <div className="mb-3">
              <h2 className="text-xl font-semibold">Episodes about {displayName}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {displayName} is the main subject — deep dives, news, or analyses.
              </p>
            </div>
            <EpisodeList items={subjectEps} showEntities />
          </section>
        )}

        {kind === "person" && mentionedEps.length > 0 && (
          <section className="sm:rounded-2xl sm:border sm:border-border/60 sm:bg-card/30 sm:p-6">
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full text-left group">
                <div>
                  <h2 className="text-xl font-semibold">Also mentioned in</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {mentionedEps.length} more episode{mentionedEps.length === 1 ? "" : "s"} that bring up {displayName} in passing.
                  </p>
                </div>
                <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <EpisodeList items={mentionedEps} showEntities />
              </CollapsibleContent>
            </Collapsible>
          </section>
        )}

        {/* NON-PERSON: original positional buckets (topic/company/ticker). */}
        {kind !== "person" && strongEps.length > 0 && (
          <section className="sm:rounded-2xl sm:border sm:border-primary/30 sm:bg-primary/[0.04] sm:p-6">
            <div className="mb-3">
              <h2 className="text-xl font-semibold">
                Featuring {displayName}
                <span className="ml-2 text-xs font-normal text-muted-foreground align-middle">as primary subject</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Episodes where {displayName} appears in the title — deep dives or main subjects.
              </p>
            </div>
            <EpisodeList items={strongEps} showEntities />
          </section>
        )}

        {kind !== "person" && mediumEps.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-3">
              <div>
                <h2 className="text-xl font-semibold">
                  {strongEps.length > 0 ? `Also discussing ${displayName}` : `Discussing ${displayName}`}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {displayName} is a meaningful topic of these episodes, though not the headline subject.
                </p>
              </div>
            </div>
            <EpisodeList items={mediumEps} showEntities />
          </section>
        )}

        {kind !== "person" && weakEps.length > 0 && (
          <section className="sm:rounded-2xl sm:border sm:border-border/60 sm:bg-card/30 sm:p-6">
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full text-left group">
                <div>
                  <h2 className="text-xl font-semibold">Briefly mentioned</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {weakEps.length} more episode{weakEps.length === 1 ? "" : "s"} that tag {displayName} but don't focus on them.
                  </p>
                </div>
                <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <EpisodeList items={weakEps} showEntities />
              </CollapsibleContent>
            </Collapsible>
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

