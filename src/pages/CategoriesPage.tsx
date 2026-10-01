import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp, Newspaper, Briefcase, Cpu, FlaskConical, HeartPulse,
  Users, Sparkles, Globe, Sun, GraduationCap, ScrollText, BookOpen,
  Film, Palette, Music, Laugh, Skull, Trophy, UtensilsCrossed,
  Drama, Baby, Hash, ArrowUpRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Seo } from "@/components/Seo";

const CAT_META: Record<string, { Icon: any; gradient: string }> = {
  trending:                 { Icon: TrendingUp,       gradient: "from-orange-500/20 to-pink-500/20"  },
  news:                     { Icon: Newspaper,        gradient: "from-red-500/20 to-orange-500/20"   },
  business:                 { Icon: Briefcase,        gradient: "from-emerald-500/20 to-teal-500/20" },
  technology:               { Icon: Cpu,              gradient: "from-blue-500/20 to-indigo-500/20"  },
  science:                  { Icon: FlaskConical,     gradient: "from-cyan-500/20 to-blue-500/20"    },
  health:                   { Icon: HeartPulse,       gradient: "from-rose-500/20 to-red-500/20"     },
  "psychology-relationships": { Icon: Users,          gradient: "from-pink-500/20 to-purple-500/20"  },
  "self-improvement":       { Icon: Sparkles,         gradient: "from-amber-500/20 to-yellow-500/20" },
  "society-culture":        { Icon: Globe,            gradient: "from-violet-500/20 to-fuchsia-500/20"},
  "religion-spirituality":  { Icon: Sun,              gradient: "from-yellow-500/20 to-amber-500/20" },
  education:                { Icon: GraduationCap,    gradient: "from-sky-500/20 to-blue-500/20"     },
  history:                  { Icon: ScrollText,       gradient: "from-stone-500/20 to-amber-700/20"  },
  "books-literature":       { Icon: BookOpen,         gradient: "from-amber-600/20 to-orange-700/20" },
  culture:                  { Icon: Film,             gradient: "from-purple-500/20 to-indigo-500/20"},
  arts:                     { Icon: Palette,          gradient: "from-fuchsia-500/20 to-pink-500/20" },
  music:                    { Icon: Music,            gradient: "from-indigo-500/20 to-violet-500/20"},
  comedy:                   { Icon: Laugh,            gradient: "from-yellow-400/20 to-orange-500/20"},
  "true-crime":             { Icon: Skull,            gradient: "from-zinc-500/20 to-red-900/20"     },
  sports:                   { Icon: Trophy,           gradient: "from-green-500/20 to-emerald-600/20"},
  food:                     { Icon: UtensilsCrossed,  gradient: "from-orange-400/20 to-red-500/20"   },
  "fiction-audio-drama":    { Icon: Drama,            gradient: "from-purple-600/20 to-rose-500/20"  },
  "kids-family":            { Icon: Baby,             gradient: "from-sky-400/20 to-cyan-400/20"     },
};

export default function CategoriesPage() {
  const [cats, setCats] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("categories").select("*").order("sort_order").then(({ data }) => setCats(data || []));
  }, []);
  return (
    <Layout>
      <Seo
        title="All podcast categories — Podiverzum"
        description="Browse the best podcasts by topic — news, tech & AI, business, investing, health, food, science and more."
        canonical="https://podiverzum.com/categories"
      />
      <section className="relative border-b border-border bg-background overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 hero-spot opacity-80" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
        <div className="relative container mx-auto py-10 sm:py-14 max-w-6xl px-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-primary font-semibold">Categories</div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mt-2">
            Browse podcasts by category
          </h1>
          <p className="text-foreground/80 mt-4 max-w-2xl leading-relaxed">
            Start broad, then drill into episodes by topic, person, company or idea. Each category highlights healthy sources and recent conversations from the English index.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <span className="rounded-full border border-border bg-card/70 px-3 py-1">{cats.length || "All"} categories</span>
            <span className="rounded-full border border-border bg-card/70 px-3 py-1">English index</span>
            <span className="rounded-full border border-border bg-card/70 px-3 py-1">Ranked by source quality</span>
          </div>
        </div>
      </section>

      <div className="container mx-auto py-10 max-w-6xl px-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cats.map((c) => {
            const meta = CAT_META[c.slug] ?? { Icon: Hash, gradient: "from-muted to-muted" };
            const Icon = meta.Icon;
            return (
              <Link
                key={c.id}
                to={`/category/${c.slug}`}
                className="group relative flex items-center gap-4 p-5 rounded-lg border border-border bg-card hover:border-accent/40 hover:bg-card/80 hover:shadow-elevated transition-all overflow-hidden"
              >
                <div aria-hidden className={`absolute inset-0 bg-gradient-to-br ${meta.gradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
                <div className={`shrink-0 w-12 h-12 rounded-lg bg-gradient-to-br ${meta.gradient} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                  <Icon className="w-6 h-6 text-foreground/80" />
                </div>
                <div className="relative min-w-0 flex-1">
                  <div className="font-medium truncate">{c.name}</div>
                  {c.description && <div className="text-sm text-muted-foreground line-clamp-2 mt-1">{c.description}</div>}
                </div>
                <ArrowUpRight className="relative h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
              </Link>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
