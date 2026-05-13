import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { ArrowRight, ArrowLeft, Sparkles, Wand2 } from "lucide-react";

type StaticMood = {
  slug: string; title: string; mood: string; description: string | null; accent_hsl: string | null;
};
type PoolMood = {
  slug: string; title: string; mood: string; description: string | null; accent_hsl: string | null;
};

export default function MoodsPage() {
  const [statics, setStatics] = useState<StaticMood[]>([]);
  const [pool, setPool] = useState<PoolMood[]>([]);

  useEffect(() => {
    supabase.from("mood_collections" as any)
      .select("slug,title,mood,description,accent_hsl,sort_order")
      .eq("active", true).order("sort_order")
      .then(({ data }) => setStatics((data as any) || []));

    supabase.from("mood_pool" as any)
      .select("slug,title,mood,description,accent_hsl,ctr,impressions")
      .eq("status", "active")
      .order("ctr", { ascending: false, nullsFirst: false })
      .limit(40)
      .then(({ data }) => setPool((data as any) || []));
  }, []);

  const Card = ({ m, dynamic }: { m: any; dynamic?: boolean }) => {
    const accent = m.accent_hsl ? `hsl(${m.accent_hsl})` : "hsl(var(--primary))";
    return (
      <Link
        to={`/mood/${m.slug}`}
        className={`group relative overflow-hidden rounded-xl border p-4 transition-colors ${dynamic ? "border-primary/30 hover:border-primary/60" : "border-border/70 hover:border-primary/40"}`}
        style={{ background: `linear-gradient(135deg, ${accent}1a, transparent 60%), hsl(var(--card) / 0.7)` }}
      >
        <div className="flex items-start justify-between">
          <Sparkles className="h-5 w-5" style={{ color: accent }} />
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform mt-5" />
        </div>
        <div className="mt-3 font-semibold leading-tight">{m.title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{m.mood}</div>
        {m.description && <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{m.description}</div>}
      </Link>
    );
  };

  return (
    <Layout>
      <Seo title="Moods — podcast collections | Podiverzum" description="Collections of podcast episodes grouped by tone, format and listening context." />
      <div className="container mx-auto py-10 max-w-5xl">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back home
        </Link>
        <div className="mt-3">
          <h1 className="text-3xl sm:text-4xl font-semibold">Moods</h1>
          <p className="text-muted-foreground mt-2 text-sm">Collections of episodes grouped by tone, format and listening context.</p>
        </div>

        {statics.length > 0 && (
          <section className="mt-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {statics.map((m) => <Card key={m.slug} m={m} />)}
            </div>
          </section>
        )}

        {pool.length > 0 && (
          <section className="mt-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {pool.map((m) => <Card key={m.slug} m={m} />)}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
