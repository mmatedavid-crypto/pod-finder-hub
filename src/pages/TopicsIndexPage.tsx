import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { siteOrigin } from "@/lib/seo-helpers";

type Hub = {
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  accent_hsl: string | null;
  appearance_stats: any;
};

export default function TopicsIndexPage() {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("topic_hubs")
        .select("slug,title,description,category,accent_hsl,appearance_stats")
        .eq("active", true)
        .order("sort_order");
      setHubs(data || []);
      setLoading(false);
    })();
  }, []);

  const byCat = new Map<string, Hub[]>();
  hubs.forEach((h) => {
    const c = h.category || "Other";
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c)!.push(h);
  });

  return (
    <Layout>
      <Seo
        title="Topic hubs — Podiverzum"
        description="Curated podcast topic hubs: GLP-1, AI agents, longevity, tariffs, Bitcoin and more. Find the best episodes on the conversations shaping the world."
        canonical={`${siteOrigin()}/topics`}
      />
      <section className="border-b border-border bg-background">
        <div className="container mx-auto py-12 sm:py-14 max-w-5xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-primary">Topic hubs</div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-2 leading-[1.05]">What podcasts are talking about</h1>
          <p className="text-foreground/80 mt-4 max-w-2xl text-[15px] leading-relaxed">
            Curated hubs that pull every angle on a topic across thousands of shows. Each hub merges related tags so you don't miss episodes filed under sibling terms (Ozempic, Wegovy, Semaglutide → all surface on GLP-1).
          </p>
        </div>
      </section>

      <div className="container mx-auto py-10 max-w-5xl">
        {loading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : hubs.length === 0 ? (
          <div className="text-muted-foreground">No topic hubs yet.</div>
        ) : (
          <div className="space-y-10">
            {Array.from(byCat.entries()).map(([cat, items]) => (
              <section key={cat}>
                <h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-3">{cat}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((h) => {
                    const ep = h.appearance_stats?.total as number | undefined;
                    const accent = h.accent_hsl
                      ? { borderColor: `hsl(${h.accent_hsl} / 0.35)`, background: `hsl(${h.accent_hsl} / 0.05)` }
                      : undefined;
                    return (
                      <Link
                        key={h.slug}
                        to={`/topic/${h.slug}`}
                        style={accent}
                        className="group rounded-2xl border border-border bg-card hover:border-primary/50 transition-colors p-5"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="text-lg font-semibold leading-snug group-hover:text-primary transition-colors">{h.title}</h3>
                          {ep ? <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{ep} eps</span> : null}
                        </div>
                        {h.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{h.description}</p>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
