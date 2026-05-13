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
      const cached = sessionStorage.getItem("podiverzum.dyn_moods_v2");
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
          sessionStorage.setItem("podiverzum.dyn_moods_v2", JSON.stringify({
            moods, expires: Date.now() + 30 * 60_000, // 30min client cache
          }));
        } catch { /* noop */ }
      } else {
        setDyn([]);
      }
    }).catch(() => setDyn([]));
  }, []);

  if (!statics.length && dyn === null) return null;

  // Target 6 cards on tablet/desktop. Prefer up to 4 AI moods, fill rest with statics.
  const dynList = dyn ?? [];
  const dynCount = Math.min(dynList.length, 4);
  const staticCount = Math.min(Math.max(6 - dynCount, 0), statics.length);
  const dynShown = dynList.slice(0, dynCount);
  const staticShown = statics.slice(0, staticCount);

  return (
    <section>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold">Browse by mood</h2>
          <p className="text-xs text-muted-foreground mt-1">Collections grouped by tone, format and listening context.</p>
        </div>
        <Link to="/moods" className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 shrink-0">
          See all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0 md:pb-0 md:overflow-visible md:grid md:grid-cols-3 md:gap-3">
        {staticShown.map((m) => {
          const Icon = STATIC_ICONS[m.slug] || Sparkles;
          const accent = m.accent_hsl ? `hsl(${m.accent_hsl})` : "hsl(var(--primary))";
          return (
            <Link
              key={m.id}
              to={`/mood/${m.slug}`}
              className="group relative overflow-hidden rounded-xl border border-border/70 bg-card/70 p-4 hover:border-primary/40 transition-colors min-w-[72%] snap-start order-2 md:min-w-0 md:order-none"
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
            <div className="h-[112px] min-w-[72%] snap-start md:min-w-0 rounded-xl border border-border/70 bg-card/40 animate-pulse order-1 md:order-none" />
            <div className="h-[112px] min-w-[72%] snap-start md:min-w-0 rounded-xl border border-border/70 bg-card/40 animate-pulse order-1 md:order-none" />
            <div className="h-[112px] min-w-[72%] snap-start md:min-w-0 rounded-xl border border-border/70 bg-card/40 animate-pulse order-1 md:order-none" />
            <div className="hidden md:block h-[112px] rounded-xl border border-border/70 bg-card/40 animate-pulse" />
          </>
        )}
        {dynShown.map((m) => {
          const accent = m.accent_hsl ? `hsl(${m.accent_hsl})` : "hsl(var(--primary))";
          const onClick = () => {
            try { (supabase.rpc as any)("mood_pool_bump_click", { p_slug: m.slug }).then?.(() => {}, () => {}); } catch { /* noop */ }
          };
          return (
            <Link
              key={m.slug}
              to={`/mood/${m.slug}`}
              onClick={onClick}
              className="group relative overflow-hidden rounded-xl border border-primary/30 bg-card/70 p-4 hover:border-primary/60 transition-colors min-w-[72%] snap-start order-1 md:min-w-0 md:order-none"
              style={{ background: `linear-gradient(135deg, ${accent}1c, transparent 60%), hsl(var(--card) / 0.7)` }}
            >
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
