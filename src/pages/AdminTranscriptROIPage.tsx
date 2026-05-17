import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

function fmtNum(n: number | null | undefined, digits = 0) {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
function fmtUsd(n: number | null | undefined, digits = 4) {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

export default function AdminTranscriptROIPage() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async (h: number) => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase.rpc("transcript_roi_report" as any, { _hours: h });
    if (error) setErr(error.message);
    else setData(data);
    setLoading(false);
  };

  useEffect(() => { load(hours); }, [hours]);

  const t = data?.transcript_24h || {};
  const srcAll = data?.source_breakdown_all || {};
  const src24 = data?.source_breakdown_24h || {};

  return (
    <Layout>
      <Seo title="Transcript Vectorization ROI — Admin" noindex />
      <div className="container mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Transcript Vectorization ROI</h1>
            <p className="text-muted-foreground text-sm">
              Last {hours}h transcript chunking & embedding metrics. Observability only — pipeline unaffected.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[6, 12, 24, 72, 168].map((h) => (
              <Button key={h} size="sm" variant={hours === h ? "default" : "outline"} onClick={() => setHours(h)}>
                {h}h
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => load(hours)} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </Button>
          </div>
        </div>

        {err && <div className="text-destructive text-sm">{err}</div>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat title="Chunks created" value={fmtNum(t.chunks_created)} />
          <Stat title="Chunks embedded" value={fmtNum(t.chunks_embedded)} />
          <Stat title="Episodes embedded" value={fmtNum(t.episodes_embedded)} />
          <Stat title="Avg chunks / episode" value={fmtNum(t.avg_chunks_per_episode, 2)} />
          <Stat title="Avg chars / chunk" value={fmtNum(t.avg_chars_per_chunk, 1)} />
          <Stat title="Avg tokens / chunk" value={fmtNum(t.avg_tokens_per_chunk, 1)} />
          <Stat title="Total tokens (est)" value={fmtNum(t.total_tokens_est)} />
          <Stat title="Total cost (est)" value={fmtUsd(t.total_cost_usd, 4)} />
          <Stat title="Cost / chunk" value={fmtUsd(t.cost_per_chunk_usd, 8)} />
          <Stat title="Cost / episode" value={fmtUsd(t.cost_per_episode_usd, 6)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Health checks</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Pending episodes (chunks_status='pending', 0 chunks)" value={fmtNum(data?.pending_episodes_no_chunks)} />
              <Row label="Duplicate transcript chunks (same episode+idx+source)" value={fmtNum(data?.duplicate_chunks)} />
              <Row label="Cost assumption (USD / 1k tokens)" value={fmtUsd(data?.cost_per_1k_tokens_usd, 6)} />
              <Row label="Window since" value={data?.since ? new Date(data.since).toLocaleString() : "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Embedding source breakdown</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="grid grid-cols-3 gap-2 font-medium text-muted-foreground text-xs mb-1">
                <span>Source</span><span className="text-right">24h</span><span className="text-right">All-time</span>
              </div>
              {["transcript_rss", "description", "ai_summary", "seo_description"].map((s) => (
                <div key={s} className="grid grid-cols-3 gap-2 py-1 border-t">
                  <span>{s}</span>
                  <span className="text-right">{fmtNum(src24[s] || 0)}</span>
                  <span className="text-right">{fmtNum(srcAll[s] || 0)}</span>
                </div>
              ))}
              {Object.keys({ ...srcAll, ...src24 })
                .filter((k) => !["transcript_rss", "description", "ai_summary", "seo_description"].includes(k))
                .map((k) => (
                  <div key={k} className="grid grid-cols-3 gap-2 py-1 border-t">
                    <span>other: {k}</span>
                    <span className="text-right">{fmtNum(src24[k] || 0)}</span>
                    <span className="text-right">{fmtNum(srcAll[k] || 0)}</span>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 50 episodes by transcript chunk count</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <div className="overflow-auto max-h-[500px]">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground text-left sticky top-0 bg-background">
                  <tr>
                    <th className="py-1">#</th>
                    <th>Episode</th>
                    <th>Podcast</th>
                    <th className="text-right">Chunks</th>
                    <th className="text-right">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.top_episodes || []).map((r: any, i: number) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-1 text-muted-foreground">{i + 1}</td>
                      <td className="truncate max-w-[280px]">{r.title}</td>
                      <td className="truncate max-w-[200px] text-muted-foreground">{r.podcast_title}</td>
                      <td className="text-right">{fmtNum(r.chunk_count)}</td>
                      <td className="text-right">{fmtUsd(r.est_cost_usd, 6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 50 podcasts by total transcript embedding cost</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <div className="overflow-auto max-h-[500px]">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground text-left sticky top-0 bg-background">
                  <tr>
                    <th className="py-1">#</th>
                    <th>Podcast</th>
                    <th className="text-right">Episodes</th>
                    <th className="text-right">Chunks</th>
                    <th className="text-right">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.top_podcasts || []).map((r: any, i: number) => (
                    <tr key={r.id || i} className="border-t">
                      <td className="py-1 text-muted-foreground">{i + 1}</td>
                      <td className="truncate max-w-[300px]">{r.title}</td>
                      <td className="text-right">{fmtNum(r.episodes)}</td>
                      <td className="text-right">{fmtNum(r.chunks)}</td>
                      <td className="text-right">{fmtUsd(r.est_cost_usd, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Token estimate: chars / 4. Cost estimate: tokens / 1000 × $0.000025 (gemini-embedding-001). Window uses
          episode_chunks.updated_at; embedding column is NOT NULL so created = embedded for stored rows.
        </p>
      </div>
    </Layout>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium">{title}</CardTitle></CardHeader>
      <CardContent><div className="text-xl font-semibold">{value}</div></CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
