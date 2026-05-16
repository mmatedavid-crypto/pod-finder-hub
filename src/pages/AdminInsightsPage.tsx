import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Seo } from "@/components/Seo";

const BOT_UA_RE = /bot|crawler|spider|googleother|applebot|chatgpt-user|claude-|perplexity|bytespider|facebookexternalhit|whatsapp|embedly|slurp|duckduck|yandex|baidu|ccbot|cohere-ai|diffbot|amazonbot/i;
function isBot(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return BOT_UA_RE.test(ua);
}

function flagEmoji(cc: string | null | undefined): string {
  if (!cc || cc.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (cc.charCodeAt(0) - 65), A + (cc.charCodeAt(1) - 65));
}

type PageRow = {
  path: string;
  user_agent: string | null;
  visitor_id: string | null;
  session_id: string | null;
  country: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
};

type EpRow = {
  event_type: string;
  platform: string | null;
  created_at: string;
  search_query: string | null;
};

type SearchRow = {
  query: string;
  result_count: number;
  fallback_used: boolean;
  created_at: string;
};

function topN<T>(map: Map<T, number>, n = 12) {
  return Array.from(map.entries())
    .map(([k, v]) => ({ k, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n);
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

const WINDOWS = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
  { label: "30d", hours: 24 * 30 },
] as const;

export default function AdminInsightsPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [windowH, setWindowH] = useState<number>(24);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [eps, setEps] = useState<EpRow[]>([]);
  const [searches, setSearches] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) { nav("/auth"); return; }
      const { data: hasAdmin } = await (supabase as any).rpc("has_role", { _user_id: uid, _role: "admin" });
      setIsAdmin(hasAdmin === true);
      setReady(true);
    })();
  }, [nav]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - windowH * 3600_000).toISOString();
        const [{ data: p }, { data: e }, { data: s }] = await Promise.all([
          supabase
            .from("page_events")
            .select("path,user_agent,visitor_id,session_id,country,referrer,utm_source,utm_medium,utm_campaign,created_at")
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(50000),
          supabase
            .from("episode_events")
            .select("event_type,platform,created_at,search_query")
            .gte("created_at", since)
            .limit(50000),
          supabase
            .from("search_events")
            .select("query,result_count,fallback_used,created_at")
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(20000),
        ]);
        if (cancelled) return;
        setPages(((p as PageRow[]) || []).filter((r) => !isBot(r.user_agent)));
        setEps((e as EpRow[]) || []);
        setSearches((s as SearchRow[]) || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, windowH]);

  const stats = useMemo(() => {
    const uniqueVisitors = new Set(pages.map((r) => r.visitor_id).filter(Boolean)).size;
    const sessions = new Map<string, { first: number; last: number; views: number }>();
    pages.forEach((r) => {
      const sid = r.session_id;
      if (!sid) return;
      const ts = new Date(r.created_at).getTime();
      const cur = sessions.get(sid);
      if (!cur) sessions.set(sid, { first: ts, last: ts, views: 1 });
      else {
        cur.first = Math.min(cur.first, ts);
        cur.last = Math.max(cur.last, ts);
        cur.views++;
      }
    });
    const sessArr = Array.from(sessions.values());
    const totalSessions = sessArr.length;
    const bounceCount = sessArr.filter((s) => s.views === 1).length;
    const avgDurationSec = sessArr.length
      ? Math.round(sessArr.reduce((acc, s) => acc + (s.last - s.first), 0) / sessArr.length / 1000)
      : 0;
    const avgViewsPerSession = sessArr.length
      ? +(pages.length / sessArr.length).toFixed(2)
      : 0;

    const byCountry = new Map<string, number>();
    const visitorSeenInCountry = new Set<string>();
    pages.forEach((r) => {
      const c = r.country || "??";
      const key = `${r.visitor_id || "anon"}|${c}`;
      if (visitorSeenInCountry.has(key)) return;
      visitorSeenInCountry.add(key);
      byCountry.set(c, (byCountry.get(c) || 0) + 1);
    });

    const bySource = new Map<string, number>();
    pages.forEach((r) => {
      let src: string;
      if (r.utm_source) {
        src = `utm:${r.utm_source}${r.utm_medium ? `/${r.utm_medium}` : ""}`;
      } else if (r.referrer) {
        const h = hostOf(r.referrer);
        if (!h || h.includes("podiverzum")) src = "direct";
        else src = h;
      } else {
        src = "direct";
      }
      bySource.set(src, (bySource.get(src) || 0) + 1);
    });

    const byCampaign = new Map<string, number>();
    pages.forEach((r) => {
      if (r.utm_campaign) byCampaign.set(r.utm_campaign, (byCampaign.get(r.utm_campaign) || 0) + 1);
    });

    // Funnel: visitor counts
    const visitorsHome = new Set<string>();
    const visitorsSearch = new Set<string>();
    const visitorsEpisode = new Set<string>();
    pages.forEach((r) => {
      const v = r.visitor_id;
      if (!v) return;
      if (r.path === "/") visitorsHome.add(v);
      if (r.path.startsWith("/search")) visitorsSearch.add(v);
      if (/^\/podcast\/[^/]+\/[^/]+$/.test(r.path)) visitorsEpisode.add(v);
    });
    const listenClicks = eps.filter((e) => e.event_type === "listen_click").length;
    const audioPlays = eps.filter((e) => e.event_type === "audio_play").length;

    const zeroResultQ = new Map<string, number>();
    const allQ = new Map<string, number>();
    const fallbackQ = new Map<string, number>();
    searches.forEach((s) => {
      const q = (s.query || "").trim().toLowerCase();
      if (!q) return;
      allQ.set(q, (allQ.get(q) || 0) + 1);
      if (s.result_count === 0) zeroResultQ.set(q, (zeroResultQ.get(q) || 0) + 1);
      if (s.fallback_used) fallbackQ.set(q, (fallbackQ.get(q) || 0) + 1);
    });

    return {
      uniqueVisitors,
      totalPageviews: pages.length,
      totalSessions,
      bounceRate: totalSessions ? +((bounceCount / totalSessions) * 100).toFixed(1) : 0,
      avgDurationSec,
      avgViewsPerSession,
      topCountries: topN(byCountry, 12),
      topSources: topN(bySource, 12),
      topCampaigns: topN(byCampaign, 8),
      visitorsHome: visitorsHome.size,
      visitorsSearch: visitorsSearch.size,
      visitorsEpisode: visitorsEpisode.size,
      listenClicks,
      audioPlays,
      totalSearches: searches.length,
      topQueries: topN(allQ, 15),
      zeroResultQueries: topN(zeroResultQ, 10),
      fallbackQueries: topN(fallbackQ, 10),
    };
  }, [pages, eps, searches]);

  if (!ready) return <Layout><div className="container mx-auto py-20 text-muted-foreground">Loading…</div></Layout>;
  if (!isAdmin) return <Layout><div className="container mx-auto py-20">Not authorized.</div></Layout>;

  const funnelSteps = [
    { label: "Visited home", value: stats.visitorsHome },
    { label: "Used search", value: stats.visitorsSearch },
    { label: "Opened episode", value: stats.visitorsEpisode },
    { label: "Clicked listen", value: stats.listenClicks },
  ];
  const funnelMax = Math.max(1, ...funnelSteps.map((s) => s.value));

  return (
    <Layout>
      <Seo title="Admin · Insights — Podiverzum" noindex />
      <div className="container mx-auto py-10 space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Insights</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Aggregate visitor stats, traffic sources, conversion funnel, and search quality.
              {loading && <span className="ml-2 text-xs">refreshing…</span>}
            </p>
          </div>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {WINDOWS.map((w) => (
              <button
                key={w.label}
                onClick={() => setWindowH(w.hours)}
                className={`px-3 py-1.5 text-sm ${windowH === w.hours ? "bg-secondary" : "hover:bg-secondary/50"}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Unique visitors" value={stats.uniqueVisitors.toLocaleString()} accent />
          <Stat label="Sessions" value={stats.totalSessions.toLocaleString()} />
          <Stat label="Pageviews" value={stats.totalPageviews.toLocaleString()} />
          <Stat label="Pages / session" value={String(stats.avgViewsPerSession)} />
          <Stat label="Avg session" value={formatDuration(stats.avgDurationSec)} />
          <Stat label="Bounce rate" value={`${stats.bounceRate}%`} />
          <Stat label="Listen clicks" value={stats.listenClicks.toLocaleString()} />
          <Stat label="Searches" value={stats.totalSearches.toLocaleString()} />
        </section>

        <section>
          <h2 className="font-semibold mb-3">Conversion funnel (unique visitors)</h2>
          <div className="space-y-2">
            {funnelSteps.map((step, idx) => {
              const pct = (step.value / funnelMax) * 100;
              const dropoff = idx > 0 && funnelSteps[idx - 1].value > 0
                ? Math.round((step.value / funnelSteps[idx - 1].value) * 100)
                : null;
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <div className="w-40 text-sm">{step.label}</div>
                  <div className="flex-1 h-6 rounded bg-secondary overflow-hidden">
                    <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-32 text-right text-sm tabular-nums">
                    {step.value.toLocaleString()}
                    {dropoff !== null && <span className="text-xs text-muted-foreground ml-2">({dropoff}%)</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section>
            <h2 className="font-semibold mb-2">Top traffic sources</h2>
            <BarList rows={stats.topSources} />
          </section>
          <section>
            <h2 className="font-semibold mb-2">Top countries (unique visitors)</h2>
            <BarList rows={stats.topCountries.map((r) => ({ k: `${flagEmoji(r.k)} ${r.k}`.trim(), v: r.v }))} />
          </section>
        </div>

        {stats.topCampaigns.length > 0 && (
          <section>
            <h2 className="font-semibold mb-2">UTM campaigns</h2>
            <BarList rows={stats.topCampaigns} />
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <section>
            <h2 className="font-semibold mb-2">Top searches</h2>
            <BarList rows={stats.topQueries} />
          </section>
          <section>
            <h2 className="font-semibold mb-2">Zero-result queries</h2>
            <BarList rows={stats.zeroResultQueries} muted />
          </section>
          <section>
            <h2 className="font-semibold mb-2">Fallback-used queries</h2>
            <BarList rows={stats.fallbackQueries} muted />
          </section>
        </div>
      </div>
    </Layout>
  );
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`p-4 rounded-lg border bg-card ${accent ? "border-primary/40" : "border-border"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function BarList({ rows, muted = false }: { rows: { k: string; v: number }[]; muted?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const pct = (r.v / max) * 100;
        return (
          <div key={r.k} className="flex items-center gap-2 text-sm">
            <div className="w-44 truncate" title={r.k}>{r.k}</div>
            <div className="flex-1 h-4 rounded bg-secondary overflow-hidden">
              <div className={`h-full ${muted ? "bg-muted-foreground/40" : "bg-primary/60"}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="w-12 text-right tabular-nums text-xs">{r.v}</div>
          </div>
        );
      })}
    </div>
  );
}
