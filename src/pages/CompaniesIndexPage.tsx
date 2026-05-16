import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { siteOrigin } from "@/lib/seo-helpers";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type Company = {
  slug: string;
  display_name: string;
  appearance_stats: { total?: number } | null;
};

// Map of known public companies → stock ticker. Private companies are omitted.
const TICKER_BY_SLUG: Record<string, string> = {
  apple: "AAPL",
  meta: "META",
  facebook: "META",
  google: "GOOGL",
  youtube: "GOOGL",
  tesla: "TSLA",
  microsoft: "MSFT",
  amazon: "AMZN",
  nvidia: "NVDA",
  netflix: "NFLX",
  disney: "DIS",
  palantir: "PLTR",
  "berkshire-hathaway": "BRK.B",
  intel: "INTC",
  paramount: "PARA",
  "spirit-airlines": "SAVE",
  bbc: "",
};

export default function CompaniesIndexPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"popular" | "az">("popular");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("entity_profiles")
        .select("slug,display_name,appearance_stats")
        .eq("kind", "company")
        .order("display_name");
      setCompanies((data || []) as Company[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = companies;
    if (needle) {
      list = list.filter((p) => p.display_name.toLowerCase().includes(needle));
    }
    if (sort === "popular") {
      list = [...list].sort(
        (a, b) => (b.appearance_stats?.total ?? 0) - (a.appearance_stats?.total ?? 0),
      );
    }
    return list;
  }, [companies, q, sort]);

  return (
    <Layout>
      <Seo
        title="Companies — every brand podcasts are discussing"
        description="Browse every company we've indexed across thousands of podcast episodes. OpenAI, Apple, Tesla, Nvidia, Anthropic and hundreds more — find the conversations shaping each one."
        canonical={`${siteOrigin()}/companies`}
      />

      <section className="border-b border-border bg-background">
        <div className="container mx-auto py-12 sm:py-14 max-w-5xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-primary">Companies</div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-2 leading-[1.05]">
            Every company podcasts are talking about
          </h1>
          <p className="text-foreground/80 mt-4 max-w-2xl text-[15px] leading-relaxed">
            {companies.length || "Hundreds of"} companies indexed across the podcast world — from frontier AI labs
            and big tech to scrappy startups. Click any name for the best episodes about it, including mentions
            buried inside hour-long conversations.
          </p>
        </div>
      </section>

      <div className="container mx-auto py-8 max-w-5xl">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search companies…"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setSort("popular")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                sort === "popular"
                  ? "bg-primary/10 text-foreground border border-primary/30"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              Most discussed
            </button>
            <button
              onClick={() => setSort("az")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                sort === "az"
                  ? "bg-primary/10 text-foreground border border-primary/30"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              A–Z
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground">No matches.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.map((c) => {
              const eps = c.appearance_stats?.total ?? 0;
              return (
                <Link
                  key={c.slug}
                  to={`/company/${c.slug}`}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/40 hover:bg-accent/30 transition-colors"
                >
                  <div className="font-medium text-sm leading-snug group-hover:text-primary transition-colors line-clamp-2">
                    {c.display_name}
                  </div>
                  {eps > 0 && (
                    <div className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {eps.toLocaleString()}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
