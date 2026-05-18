import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { siteOrigin } from "@/lib/seo-helpers";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type Person = {
  slug: string;
  display_name: string;
  bio: string | null;
  image_url: string | null;
  appearance_stats: { total?: number; guest?: number; host?: number; mentioned?: number } | null;
};

function initials(name: string) {
  return name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
}
function bgFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 30% 88%)`;
}

function Avatar({ person }: { person: Person }) {
  const [broken, setBroken] = useState(false);
  const show = person.image_url && !broken;
  return (
    <div
      className="aspect-square w-full overflow-hidden rounded-full border border-border bg-muted"
      style={!show ? { background: bgFor(person.display_name) } : undefined}
    >
      {show ? (
        <img
          src={person.image_url!}
          alt={person.display_name}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-semibold text-foreground/70 text-lg">
          {initials(person.display_name)}
        </div>
      )}
    </div>
  );
}

export default function PeopleIndexPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"popular" | "az">("popular");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("entity_profiles")
        .select("slug,display_name,bio,image_url,appearance_stats")
        .eq("kind", "person")
        .order("display_name");
      setPeople((data || []) as Person[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = people;
    if (needle) {
      list = list.filter((p) => p.display_name.toLowerCase().includes(needle));
    }
    if (sort === "popular") {
      list = [...list].sort(
        (a, b) => (b.appearance_stats?.total ?? 0) - (a.appearance_stats?.total ?? 0),
      );
    }
    return list;
  }, [people, q, sort]);

  return (
    <Layout>
      <Seo
        title="People — every name podcasts are talking about"
        description="Browse every person we've indexed across thousands of podcast episodes. Find the best conversations about Elon Musk, Sam Altman, Donald Trump, Andrew Huberman and 260+ more."
        canonical={`${siteOrigin()}/people`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "People on Podiverzum",
          description:
            "Every person indexed across thousands of podcast episodes — founders, politicians, scientists, athletes, writers.",
          url: `${siteOrigin()}/people`,
          isPartOf: { "@type": "WebSite", name: "Podiverzum", url: siteOrigin() },
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: people.length,
            itemListElement: filtered.slice(0, 50).map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: p.display_name,
              url: `${siteOrigin()}/person/${p.slug}`,
            })),
          },
        }}
      />

      <section className="border-b border-border bg-background">
        <div className="container mx-auto py-12 sm:py-14 max-w-5xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-primary">People</div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-2 leading-[1.05]">
            Every name podcasts are talking about
          </h1>
          <p className="text-foreground/80 mt-4 max-w-2xl text-[15px] leading-relaxed">
            {people.length || "Hundreds of"} people indexed across the podcast world — founders, politicians,
            scientists, athletes, writers. Click any name to find the best episodes about them, including
            mentions buried inside hour-long conversations.
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
              placeholder="Search people…"
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
            {filtered.map((p) => {
              const eps = p.appearance_stats?.total ?? 0;
              return (
                <Link
                  key={p.slug}
                  to={`/person/${p.slug}`}
                  className="group flex flex-col items-center text-center"
                >
                  <div className="w-full transition-transform group-hover:scale-[1.03]">
                    <Avatar person={p} />
                  </div>
                  <div className="mt-2.5 text-sm font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2">
                    {p.display_name}
                  </div>
                  {eps > 0 && (
                    <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                      {eps.toLocaleString()} ep{eps === 1 ? "" : "s"}
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
