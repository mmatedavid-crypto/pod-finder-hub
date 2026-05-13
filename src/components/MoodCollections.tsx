import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Brain, GraduationCap, Sparkles, Wand2 } from "lucide-react";

type StaticMood = {
  id: string;
  slug: string;
  title: string;
  mood: string;
  description: string | null;
  accent_hsl: string | null;
  podcast_ids: string[];
  episode_ids: string[];
  sort_order: number;
};

type DynamicMood = {
  slug: string; // "dyn-..."
  title: string;
  mood: string;
  description: string;
  accent_hsl: string;
  episode_ids: string[];
};

const STATIC_ICONS: Record<string, any> = {
  "deep-focus": Brain,
  "learn-something-new": GraduationCap,
};

export function MoodCollections() {
  const [statics, setStatics] = useState<StaticMood[]>([]);
  const [dyn, setDyn] = useState<DynamicMood[] | null>(null); // null = loading

  useEffect(() => {
    supabase
      .from("mood_collections" as any)
      .select("id,slug,title,mood,description,accent_hsl,podcast_ids,episode_ids,sort_order")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setStatics((data as any) || []));

    // Cache personalized moods in sessionStorage so they don't shuffle on every page nav
    try {
      const cached = sessionStorage.getItem("podiverzum.dyn_moods");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.expires > Date.now() && Array.isArray(parsed.moods)) {
          setDyn(parsed.moods);
          return;
        }
      }
    } catch { /* noop */ }

    supabase.functions.invoke("mood-personalize").then(({ data }) => {
      const moods = (data as any)?.moods as DynamicMood[] | undefined;
      if (moods?.length) {
        setDyn(moods);
        try {
          sessionStorage.setItem("podiverzum.dyn_moods", JSON.stringify({
            moods, expires: Date.now() + 30 * 60_000, // 30min client cache
          }));
        } catch { /* noop */ }
      } else {
        setDyn([]);
      }
    }).catch(() => setDyn([]));
  }, []);

  if (!statics.length && dyn === null) return null;

  return (
    <section>
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-primary/90 mb-1">
            <Sparkles className="h-3 w-3" /> Discover by mood
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold">What are you in the mood for?</h2>
          <p className="text-xs text-muted-foreground mt-1">A few picks for right now — see all on the categories page.</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {statics.slice(0, 1).map((m) => {
          const Icon = STATIC_ICONS[m.slug] || Sparkles;
          const accent = m.accent_hsl ? `hsl(${m.accent_hsl})` : "hsl(var(--primary))";
          return (
            <Link
              key={m.id}
              to={`/mood/${m.slug}`}
              className="group relative overflow-hidden rounded-xl border border-border/70 bg-card/70 p-4 hover:border-primary/40 transition-colors"
              style={{ background: `linear-gradient(135deg, ${accent}11, transparent 60%), hsl(var(--card) / 0.7)` }}
            >
              <div className="flex items-start justify-between">
                <Icon className="h-5 w-5" style={{ color: accent }} />
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="mt-3 font-semibold leading-tight">{m.title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{m.mood}</div>
            </Link>
          );
        })}

        {/* Dynamic slots */}
        {dyn === null && (
          <>
            <div className="h-[112px] rounded-xl border border-border/70 bg-card/40 animate-pulse" />
            <div className="h-[112px] rounded-xl border border-border/70 bg-card/40 animate-pulse" />
          </>
        )}
        {dyn?.slice(0, 2).map((m) => {
          const accent = m.accent_hsl ? `hsl(${m.accent_hsl})` : "hsl(var(--primary))";
          const onClick = () => {
            try { (supabase.rpc as any)("mood_pool_bump_click", { p_slug: m.slug }).then?.(() => {}, () => {}); } catch { /* noop */ }
          };
          return (
            <Link
              key={m.slug}
              to={`/mood/${m.slug}`}
              onClick={onClick}
              className="group relative overflow-hidden rounded-xl border border-primary/30 bg-card/70 p-4 hover:border-primary/60 transition-colors"
              style={{ background: `linear-gradient(135deg, ${accent}1c, transparent 60%), hsl(var(--card) / 0.7)` }}
            >
              <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[9px] uppercase tracking-[0.14em]">
                <Wand2 className="h-2.5 w-2.5" /> for you
              </div>
              <div className="flex items-start justify-between">
                <Sparkles className="h-5 w-5" style={{ color: accent }} />
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform mt-5" />
              </div>
              <div className="mt-3 font-semibold leading-tight">{m.title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{m.mood}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
