import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Vec, mean, sub, add, scale, normalize, toPgVector, parsePgVector, zero } from "@/lib/tasteVector";
import { buildAura, buildElement, buildConstellation, buildVerdict, buildPdvCode } from "@/lib/podiverzumProfile";
import { pickArchetype } from "@/lib/tasteArchetypes";
import { trackLandingEvent } from "@/lib/landingEvents";
import { SoftAuthCTA } from "@/components/SoftAuthCTA";
import { Skeleton } from "@/components/ui/skeleton";

type Card = { id: string; title: string; topic_tags: string[]; mood_tags: string[]; archetype_tags: string[]; card_embedding: Vec };
type RecEp = {
  episode_id: string; podcast_id: string; title: string; display_title: string | null; slug: string;
  image_url: string | null; ai_summary: string | null;
  podcast_title: string; podcast_slug: string; podcast_image_url: string | null;
  final_score: number; published_at?: string | null;
};

const STORAGE_KEY = "podiverzum_taste_v1";

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { sessionId: "", seenCardIds: [], likedCardIds: [], dislikedCardIds: [], superLikedCardIds: [] };
}

export default function MyPodiverzumPage() {
  const persisted = useMemo(loadPersisted, []);
  const [pool, setPool] = useState<Card[] | null>(null);
  const [recs, setRecs] = useState<RecEp[] | null>(null);

  useEffect(() => {
    document.title = "Your Podiverzum";
    trackLandingEvent("ResultViewed");
    (async () => {
      const { data } = await supabase.rpc("get_active_taste_cards", { p_limit: 200 });
      const cards: Card[] = (data || []).map((r: any) => ({
        id: r.id, title: r.title,
        topic_tags: r.topic_tags || [], mood_tags: r.mood_tags || [], archetype_tags: r.archetype_tags || [],
        card_embedding: parsePgVector(r.card_embedding) || [],
      })).filter((c: Card) => c.card_embedding.length === 768);
      setPool(cards);
    })();
  }, []);

  const liked = useMemo(() => {
    if (!pool) return [] as Card[];
    const byId = new Map(pool.map(c => [c.id, c] as const));
    const ids = [...(persisted.likedCardIds || []), ...(persisted.superLikedCardIds || []), ...(persisted.superLikedCardIds || [])];
    return ids.map(id => byId.get(id)).filter((c): c is Card => !!c);
  }, [pool, persisted]);

  const disliked = useMemo(() => {
    if (!pool) return [] as Card[];
    const byId = new Map(pool.map(c => [c.id, c] as const));
    return (persisted.dislikedCardIds || []).map((id: string) => byId.get(id)).filter((c: Card | undefined): c is Card => !!c);
  }, [pool, persisted]);

  const tagWeights = useMemo(() => {
    const w: Record<string, number> = {};
    for (const c of liked) {
      for (const t of [...c.topic_tags, ...c.mood_tags, ...c.archetype_tags]) {
        const k = t.toLowerCase();
        w[k] = (w[k] || 0) + 1;
      }
    }
    return w;
  }, [liked]);

  const archetype = useMemo(() => pickArchetype(tagWeights), [tagWeights]);
  const moodWeights = useMemo(() => {
    const w: Record<string, number> = {};
    for (const c of liked) for (const m of c.mood_tags) {
      const k = m.toLowerCase();
      w[k] = (w[k] || 0) + 1;
    }
    return w;
  }, [liked]);
  const topMoods = useMemo(() => Object.entries(moodWeights).sort((a, b) => b[1] - a[1]).map(([t]) => t), [moodWeights]);
  const topTopics = useMemo(() => {
    const w: Record<string, number> = {};
    for (const c of liked) for (const t of c.topic_tags) w[t] = (w[t] || 0) + 1;
    return Object.entries(w).sort((a, b) => b[1] - a[1]).map(([label, weight]) => ({ label, weight }));
  }, [liked]);

  const seed = useMemo(() => (persisted.sessionId || "") + ":" + liked.map((c: Card) => c.id).join(","), [liked, persisted]);
  const aura = useMemo(() => buildAura(moodWeights), [moodWeights]);
  const element = useMemo(() => buildElement(moodWeights), [moodWeights]);
  const constellation = useMemo(() => buildConstellation(topTopics, seed), [topTopics, seed]);
  const verdict = useMemo(() => buildVerdict({
    topMoods, topTopics: topTopics.map(t => t.label),
    archetypeName: archetype.name, archetypeId: archetype.id, element: element.key,
  }, seed), [topMoods, topTopics, archetype, element, seed]);
  const pdvCode = useMemo(() => buildPdvCode(seed), [seed]);

  useEffect(() => {
    if (!pool || liked.length === 0 || recs) return;
    (async () => {
      const centroid = mean(pool.map(c => c.card_embedding));
      const likedDev = mean(liked.map(c => sub(c.card_embedding, centroid)));
      const dislikedDev = disliked.length ? mean(disliked.map(c => sub(c.card_embedding, centroid))) : zero(centroid.length);
      const direction = sub(likedDev, dislikedDev);
      const userVec = normalize(add(centroid, scale(direction, 2.5)));
      const negVec = disliked.length ? normalize(add(centroid, scale(dislikedDev, 2.5))) : null;
      const { data, error } = await supabase.rpc("match_episodes_by_taste_vector", {
        p_user_vector: toPgVector(userVec) as any,
        p_negative_vector: negVec ? (toPgVector(negVec) as any) : null,
        p_exclude_episode_ids: [],
        p_limit: 16,
      });
      if (error) { console.warn(error.message); return; }
      setRecs((data as RecEp[]) || []);
    })();
  }, [pool, liked, disliked, recs]);

  if (!pool) {
    return <main className="min-h-screen p-6"><Skeleton className="h-64 w-full max-w-xl mx-auto" /></main>;
  }

  if (liked.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <p className="text-base font-medium mb-2">No swipe data yet.</p>
          <Link to="/start" className="text-sm text-primary underline">Start the swipe →</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto max-w-xl px-5 py-10 space-y-8">
        {/* Aura */}
        <div className="relative rounded-3xl overflow-hidden border border-border p-8 text-center"
             style={{ background: `linear-gradient(135deg, ${aura.colors[0]}, ${aura.colors[1] ?? aura.colors[0]}, ${aura.colors[2] ?? aura.colors[0]})` }}>
          <div className="text-xs uppercase tracking-[0.2em] text-white/80 mb-2">Your aura</div>
          <div className="text-3xl font-semibold text-white drop-shadow mb-2">{archetype.name}</div>
          <div className="text-sm text-white/90 italic">{aura.essence}</div>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white text-xs backdrop-blur-sm">
            <span className="text-lg leading-none">{element.symbol}</span>
            <span>{element.label} · {element.tagline}</span>
          </div>
          <div className="mt-3 text-[10px] tracking-[0.2em] text-white/70">{pdvCode}</div>
        </div>

        {/* Constellation */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Your constellation</div>
          <div className="text-base font-medium mb-3">{constellation.name}</div>
          <svg viewBox="0 0 400 220" className="w-full">
            {constellation.edges.map(([i, j], k) => {
              const a = constellation.stars[i], b = constellation.stars[j];
              if (!a || !b) return null;
              return <line key={k} x1={a.x * 400} y1={a.y * 220} x2={b.x * 400} y2={b.y * 220} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.35} strokeWidth={0.6} />;
            })}
            {constellation.stars.map((s, k) => (
              <g key={k}>
                <circle cx={s.x * 400} cy={s.y * 220} r={s.radius} fill="hsl(var(--primary))" opacity={s.brightness} />
                <text x={s.x * 400 + s.radius + 4} y={s.y * 220 + 3} fontSize={9} fill="hsl(var(--muted-foreground))">{s.label}</text>
              </g>
            ))}
          </svg>
        </div>

        {/* Verdict */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">The read</div>
          <p className="text-base leading-relaxed">{verdict}</p>
          <p className="text-sm text-muted-foreground mt-3">{archetype.tagline}</p>
        </div>

        {/* Recommendations */}
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">Picks for you</div>
          {!recs ? (
            <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : recs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches yet — try a few more swipes.</p>
          ) : (
            <div className="space-y-2">
              {recs.slice(0, 8).map(r => (
                <Link key={r.episode_id} to={`/podcast/${r.podcast_slug}/${r.slug}`}
                      className="flex gap-3 p-3 rounded-xl border border-border hover:bg-secondary transition">
                  {r.image_url || r.podcast_image_url ? (
                    <img src={r.image_url || r.podcast_image_url!} alt="" className="h-14 w-14 rounded-md object-cover flex-none" loading="lazy" />
                  ) : <div className="h-14 w-14 rounded-md bg-muted flex-none" />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.display_title || r.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.podcast_title}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Soft Auth */}
        <SoftAuthCTA archetypeId={archetype.id} archetypeName={archetype.name} pdvCode={pdvCode} />

        <div className="text-center">
          <Link to="/start/swipe" className="text-sm text-muted-foreground hover:text-foreground underline">Start over</Link>
        </div>
      </section>
    </main>
  );
}
