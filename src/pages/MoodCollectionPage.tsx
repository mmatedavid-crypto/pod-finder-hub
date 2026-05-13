import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Seo } from "@/components/Seo";
import NotFoundState from "@/components/NotFoundState";
import { PodcastCard } from "@/components/PodcastCard";
import { EpisodeList, EpisodeLite } from "@/components/EpisodeCard";
import { compareByScore } from "@/lib/episodeRank";
import { ArrowLeft, Sparkles } from "lucide-react";

export default function MoodCollectionPage() {
  const { slug } = useParams();
  const [mood, setMood] = useState<any>(null);
  const [podcasts, setPodcasts] = useState<any[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);

      // Dynamic AI mood
      if (slug.startsWith("dyn-")) {
        try {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mood-personalize?slug=${encodeURIComponent(slug)}`;
          const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } });
          const j = await res.json();
          const m = j?.mood;
          if (m) {
            setMood({ ...m, podcast_ids: [], episode_ids: m.episode_ids || [] });
            const eps = (m.episodes || []).map((e: any) => ({
              id: e.episode_id,
              slug: e.episode_slug,
              title: e.title,
              display_title: e.display_title,
              ai_summary: e.ai_summary,
              published_at: e.published_at,
              audio_url: e.audio_url,
              podcasts: {
                slug: e.podcast_slug,
                title: e.podcast_title,
                display_title: e.podcast_display_title,
                image_url: e.podcast_image_url,
                category: e.podcast_category,
                rank_label: e.rank_label,
              },
            }));
            setEpisodes(eps as any);
          }
        } catch (e) { console.warn(e); }
        setLoading(false);
        return;
      }

      // Static mood
      const { data: m } = await supabase
        .from("mood_collections" as any)
        .select("*").eq("slug", slug).eq("active", true).maybeSingle();
      setMood(m);
      setLoading(false);
      if (!m) return;
      const ids: string[] = (m as any).podcast_ids || [];
      const epIds: string[] = (m as any).episode_ids || [];
      if (epIds.length) {
        const { data: eps } = await supabase
          .from("episodes")
          .select("id,title,display_title,slug,summary,ai_summary,description,published_at,audio_url,topics,podcasts!inner(slug,title,display_title,image_url,category,podiverzum_rank,rank_label)")
          .in("id", epIds);
        // Preserve curated order
        const order = new Map(epIds.map((id, i) => [id, i]));
        const sorted = (eps || []).slice().sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        setEpisodes(sorted as any);
      }
      if (ids.length) {
        const { data: ps } = await supabase.from("podcasts")
          .select("id,title,display_title,slug,summary,description,image_url,category,apple_url,spotify_url,youtube_url,website_url,featured,rss_status,podiverzum_rank,rank_label")
          .in("id", ids);
        setPodcasts(ps || []);
      }
    })();
  }, [slug]);

  if (loading) return <Layout><div className="container mx-auto py-20 text-muted-foreground">Loading…</div></Layout>;
  if (!mood) return <NotFoundState title="Collection not found" message="That collection doesn't exist or is no longer active." />;

  const accent = mood.accent_hsl ? `hsl(${mood.accent_hsl})` : "hsl(var(--primary))";
  const empty = podcasts.length === 0 && episodes.length === 0;

  return (
    <Layout>
      <Seo
        title={`${mood.title} — podcast collection | Podiverzum`}
        description={mood.description || `Podcasts and episodes in the ${mood.mood} collection.`}
      />
      <div className="container mx-auto py-10 max-w-5xl">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back home
        </Link>
        <div className="mt-3 rounded-2xl border border-border bg-card/60 p-6 sm:p-8" style={{ background: `linear-gradient(135deg, ${accent}1a, transparent 70%), hsl(var(--card) / 0.6)` }}>
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] mb-2" style={{ color: accent }}>
            <Sparkles className="h-3 w-3" /> Mood collection
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">{mood.title}</h1>
          <p className="text-muted-foreground mt-2">{mood.description || mood.mood}</p>
        </div>

        {empty ? (
          <div className="mt-10 p-6 border border-border rounded-lg bg-card text-sm text-muted-foreground">
            This collection is being curated. Check back soon.
          </div>
        ) : (
          <>
            {episodes.length > 0 && (
              <section className="mt-10">
                <h2 className="font-semibold mb-3">Latest episodes</h2>
                <EpisodeList items={episodes} />
              </section>
            )}
            {podcasts.length > 0 && (
              <section className="mt-10">
                <h2 className="font-semibold mb-3">Podcasts in this collection</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {podcasts.map((p) => <PodcastCard key={p.id} p={p} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
