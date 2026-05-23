import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { Heart, X, Star, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Vec, mean, cosine, parsePgVector } from "@/lib/tasteVector";
import { snapshotUtmFromUrl, trackLandingEvent } from "@/lib/landingEvents";
import { logSwipe } from "@/lib/tasteInteractions";

type Card = {
  id: string; title: string; subtitle: string | null;
  stage: string; topic_tags: string[]; mood_tags: string[]; archetype_tags: string[];
  card_embedding: Vec;
};

const STORAGE_KEY = "podiverzum_taste_v1";

type Persisted = {
  sessionId: string;
  seenCardIds: string[];
  likedCardIds: string[];
  dislikedCardIds: string[];
  superLikedCardIds: string[];
};

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        sessionId: p.sessionId || crypto.randomUUID(),
        seenCardIds: p.seenCardIds || [],
        likedCardIds: p.likedCardIds || [],
        dislikedCardIds: p.dislikedCardIds || [],
        superLikedCardIds: p.superLikedCardIds || [],
      };
    }
  } catch { /* ignore */ }
  return { sessionId: crypto.randomUUID(), seenCardIds: [], likedCardIds: [], dislikedCardIds: [], superLikedCardIds: [] };
}
function savePersisted(p: Persisted) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ } }

function pickNext(pool: Card[], seen: Set<string>, liked: Card[], disliked: Card[], idx: number): Card | null {
  const candidates = pool.filter(c => !seen.has(c.id));
  if (!candidates.length) return null;
  // First 8: rotate through broad
  if (idx < 8) {
    const broads = candidates.filter(c => c.stage === "broad");
    if (broads.length) return broads[Math.floor(Math.random() * broads.length)];
  }
  const posMean = liked.length ? mean(liked.map(c => c.card_embedding)) : null;
  const negMean = disliked.length ? mean(disliked.map(c => c.card_embedding)) : null;
  const scored = candidates.map(c => {
    const rel = posMean ? Math.max(0, cosine(c.card_embedding, posMean)) : 0;
    const neg = negMean ? Math.max(0, cosine(c.card_embedding, negMean)) : 0;
    const score = 0.4 * rel - 0.2 * neg + 0.4 * Math.random();
    return { c, score };
  }).sort((a, b) => b.score - a.score);
  return scored[Math.floor(Math.random() * Math.min(4, scored.length))]?.c ?? null;
}

export default function StartSwipePage() {
  const nav = useNavigate();
  const [persisted, setPersisted] = useState<Persisted>(() => loadPersisted());
  const [pool, setPool] = useState<Card[] | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Card | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, Card>();
    (pool || []).forEach(c => m.set(c.id, c));
    return m;
  }, [pool]);
  const liked = useMemo(() => persisted.likedCardIds.map(id => byId.get(id)).filter((c): c is Card => !!c), [persisted.likedCardIds, byId]);
  const disliked = useMemo(() => persisted.dislikedCardIds.map(id => byId.get(id)).filter((c): c is Card => !!c), [persisted.dislikedCardIds, byId]);
  const total = persisted.seenCardIds.length;

  useEffect(() => {
    document.title = "Swipe — Podiverzum";
    snapshotUtmFromUrl();
    trackLandingEvent("SwipeStarted");
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_active_taste_cards", { p_limit: 200 });
      if (cancelled) return;
      if (error) { setPoolError(error.message); return; }
      const cards: Card[] = (data || []).map((r: any) => ({
        id: r.id, title: r.title, subtitle: r.subtitle, stage: r.stage,
        topic_tags: r.topic_tags || [], mood_tags: r.mood_tags || [], archetype_tags: r.archetype_tags || [],
        card_embedding: parsePgVector(r.card_embedding) || [],
      })).filter((c: Card) => c.card_embedding.length === 768);
      setPool(cards);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!pool || current) return;
    const seen = new Set(persisted.seenCardIds);
    const next = pickNext(pool, seen, liked, disliked, total);
    setCurrent(next);
  }, [pool, current, persisted.seenCardIds, liked, disliked, total]);

  // Stop after 12+ swipes with at least 4 likes, or hard cap 22
  const shouldStop = (total >= 12 && liked.length >= 4) || total >= 22;
  useEffect(() => {
    if (shouldStop && pool && total > 0) {
      trackLandingEvent("SwipeCompleted", { swipes: total, likes: liked.length });
      nav("/my-podiverzum");
    }
  }, [shouldStop, nav, pool, total, liked.length]);

  const handleSwipe = (action: "like" | "skip" | "super") => {
    if (!current) return;
    logSwipe(current.id, action, total);
    const next: Persisted = {
      ...persisted,
      seenCardIds: [...persisted.seenCardIds, current.id],
      likedCardIds: action !== "skip" ? [...persisted.likedCardIds, current.id] : persisted.likedCardIds,
      dislikedCardIds: action === "skip" ? [...persisted.dislikedCardIds, current.id] : persisted.dislikedCardIds,
      superLikedCardIds: action === "super" ? [...persisted.superLikedCardIds, current.id] : persisted.superLikedCardIds,
    };
    setPersisted(next);
    savePersisted(next);
    setCurrent(null);
  };

  const handleReset = () => {
    const fresh: Persisted = { sessionId: crypto.randomUUID(), seenCardIds: [], likedCardIds: [], dislikedCardIds: [], superLikedCardIds: [] };
    setPersisted(fresh);
    savePersisted(fresh);
    setCurrent(null);
  };

  if (poolError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground mb-3">Couldn't load the cards.</p>
          <p className="text-xs text-muted-foreground/70">{poolError}</p>
        </div>
      </main>
    );
  }
  if (!pool) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Skeleton className="h-80 w-72 rounded-2xl" />
      </main>
    );
  }
  if (pool.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <p className="text-base font-medium mb-2">Cards aren't ready yet.</p>
          <p className="text-sm text-muted-foreground">The taste cards haven't been embedded. An admin needs to run the embedder once.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="text-xs text-muted-foreground">
          {Math.min(total, 22)} / 22 · {liked.length} liked
        </div>
        <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <RotateCcw className="h-3 w-3" /> Restart
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center px-5">
        <div className="relative h-[420px] w-full max-w-sm">
          <AnimatePresence>
            {current && (
              <SwipeCard key={current.id} card={current} onSwipe={handleSwipe} />
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 pb-10 pt-2">
        <button onClick={() => handleSwipe("skip")} className="h-14 w-14 rounded-full border border-border bg-card hover:bg-secondary inline-flex items-center justify-center" aria-label="Skip">
          <X className="h-6 w-6 text-muted-foreground" />
        </button>
        <button onClick={() => handleSwipe("super")} className="h-12 w-12 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 inline-flex items-center justify-center" aria-label="Super like">
          <Star className="h-5 w-5 text-primary" />
        </button>
        <button onClick={() => handleSwipe("like")} className="h-14 w-14 rounded-full bg-primary text-primary-foreground hover:opacity-90 inline-flex items-center justify-center" aria-label="Like">
          <Heart className="h-6 w-6" />
        </button>
      </div>
    </main>
  );
}

function SwipeCard({ card, onSwipe }: { card: Card; onSwipe: (a: "like" | "skip" | "super") => void }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const likeOpacity = useTransform(x, [40, 140], [0, 1]);
  const skipOpacity = useTransform(x, [-140, -40], [1, 0]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y < -120) onSwipe("super");
    else if (info.offset.x > 120) onSwipe("like");
    else if (info.offset.x < -120) onSwipe("skip");
  };

  return (
    <motion.div
      className="absolute inset-0 rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-lg cursor-grab active:cursor-grabbing"
      style={{ x, y, rotate }}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ x: x.get() > 0 ? 400 : x.get() < 0 ? -400 : 0, y: y.get() < -50 ? -400 : 0, opacity: 0, transition: { duration: 0.25 } }}
    >
      <motion.div style={{ opacity: likeOpacity }} className="absolute top-5 right-5 px-3 py-1 rounded-full border-2 border-primary text-primary text-sm font-bold rotate-12">
        LIKE
      </motion.div>
      <motion.div style={{ opacity: skipOpacity }} className="absolute top-5 left-5 px-3 py-1 rounded-full border-2 border-muted-foreground text-muted-foreground text-sm font-bold -rotate-12">
        SKIP
      </motion.div>

      <div className="text-[10px] uppercase tracking-[0.2em] text-primary mb-3">
        {card.stage === "broad" ? "Topic" : "Refine"}
      </div>
      <div className="text-2xl font-semibold leading-tight mb-3">{card.title}</div>
      {card.subtitle && <div className="text-sm text-muted-foreground leading-relaxed">{card.subtitle}</div>}

      <div className="absolute bottom-5 left-6 right-6 text-xs text-muted-foreground/70">
        Swipe right to like · left to skip · up to super-like
      </div>
    </motion.div>
  );
}
