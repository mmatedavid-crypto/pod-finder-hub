import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Seo } from "@/components/Seo";
import Layout from "@/components/Layout";
import { Loader2, Play, Download, RefreshCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const TEMP_ADMIN_USER_ID = "7b92654a-2b5d-438c-ad67-7ad5f6709483";

type TikTokVideo = {
  id: string;
  episode_id: string;
  podcast_id: string;
  status: string;
  script: string | null;
  voiceover_url: string | null;
  voiceover_duration_s: number | null;
  broll_image_urls: string[] | null;
  video_url: string | null;
  total_cost_usd: number | null;
  error: string | null;
  created_at: string;
  generated_at: string | null;
  episodes?: { title: string; slug: string; podcast_id: string };
  podcasts?: { title: string; slug: string };
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  script_done: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  tts_done: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  stt_done: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  images_done: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  rendered: "bg-green-500/20 text-green-700 dark:text-green-300",
  failed: "bg-red-500/20 text-red-700 dark:text-red-300",
};

export default function AdminTikTokPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [videos, setVideos] = useState<TikTokVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<TikTokVideo | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) { nav("/auth"); return; }
      const { data: hasAdmin } = await (supabase as any).rpc("has_role", { _user_id: uid, _role: "admin" });
      const admin = hasAdmin === true || uid === TEMP_ADMIN_USER_ID;
      setIsAdmin(admin);
      setReady(true);
      if (admin) load();
    })();
  }, [nav]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tiktok_videos")
      .select("*, episodes(title, slug, podcast_id), podcasts(title, slug)")
      .order("created_at", { ascending: false })
      .limit(30);
    setVideos((data || []) as any);
    setLoading(false);
  };

  const generateNow = async (regenerate = false, episodeId?: string) => {
    setGenerating(true); setMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("tiktok-generate", {
        body: { regenerate, ...(episodeId ? { episode_id: episodeId } : {}) },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason || data?.error || "Unknown error");
      setMsg(`✓ Generated. Cost: $${(data.total_cost_usd || 0).toFixed(3)}`);
      await load();
    } catch (e: any) {
      setMsg(`✗ ${e?.message || String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  if (!ready) return <Layout><div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin" /></div></Layout>;
  if (!isAdmin) return <Layout><div className="p-8">Admin only.</div></Layout>;

  return (
    <Layout>
      <Seo title="Admin · TikTok Videos" description="Generated TikTok videos from top episodes" noindex />
      <div className="container max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">TikTok Videos</h1>
            <p className="text-sm text-muted-foreground">Daily auto-generated 9:16 highlight clips. Manual download for now.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => generateNow(false)} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Generate now
            </Button>
            <Button variant="outline" onClick={load} disabled={loading} size="icon">
              <RefreshCcw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </header>

        {msg && <div className="text-sm rounded-md border border-border bg-muted/40 px-3 py-2">{msg}</div>}

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-muted-foreground border-b border-border">
            <div className="col-span-5">Episode</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Cost</div>
            <div className="col-span-3">Created</div>
          </div>
          {loading && <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>}
          {!loading && videos.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">No videos yet. Click "Generate now" to create one.</div>
          )}
          {videos.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(v)}
              className="w-full grid grid-cols-12 gap-2 px-4 py-3 text-sm border-b border-border last:border-b-0 hover:bg-muted/40 text-left transition-colors"
            >
              <div className="col-span-5 min-w-0">
                <div className="font-medium truncate">{v.episodes?.title || v.episode_id}</div>
                <div className="text-xs text-muted-foreground truncate">{v.podcasts?.title}</div>
              </div>
              <div className="col-span-2">
                <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded ${STATUS_COLORS[v.status] || "bg-muted"}`}>
                  {v.status}
                </span>
              </div>
              <div className="col-span-2 text-muted-foreground">${Number(v.total_cost_usd || 0).toFixed(3)}</div>
              <div className="col-span-3 text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold truncate">{selected.episodes?.title}</h2>
              <button onClick={() => setSelected(null)} className="rounded-md p-1 hover:bg-muted"><X className="size-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              {selected.video_url && (
                <video src={selected.video_url} controls className="w-full max-w-xs mx-auto rounded-lg bg-black aspect-[9/16]" />
              )}
              {selected.video_url && (
                <div className="flex gap-2">
                  <a href={selected.video_url} download className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">
                    <Download className="size-4" /> Download MP4
                  </a>
                  <Button variant="outline" onClick={() => generateNow(true, selected.episode_id)} disabled={generating}>
                    Regenerate
                  </Button>
                </div>
              )}
              {selected.script && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Script</h3>
                  <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-3">{selected.script}</p>
                </div>
              )}
              {selected.broll_image_urls && selected.broll_image_urls.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">B-roll</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {selected.broll_image_urls.map((u, i) => (
                      <img key={i} src={u} alt={`b-roll ${i + 1}`} className="aspect-[9/16] object-cover rounded-md" />
                    ))}
                  </div>
                </div>
              )}
              {selected.voiceover_url && !selected.video_url && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Voiceover</h3>
                  <audio src={selected.voiceover_url} controls className="w-full" />
                </div>
              )}
              {selected.error && (
                <div>
                  <h3 className="text-xs font-semibold text-red-500 uppercase mb-1">Error</h3>
                  <p className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap rounded-md bg-red-500/10 p-3">{selected.error}</p>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Status: <strong>{selected.status}</strong> · Cost: ${Number(selected.total_cost_usd || 0).toFixed(3)}
                {selected.voiceover_duration_s ? ` · Duration: ${Number(selected.voiceover_duration_s).toFixed(1)}s` : ""}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
