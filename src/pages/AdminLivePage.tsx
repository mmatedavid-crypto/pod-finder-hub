import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Seo } from "@/components/Seo";

type Row = {
  id: string;
  path: string;
  full_url: string | null;
  user_id: string | null;
  referrer: string | null;
  created_at: string;
  user_agent: string | null;
  visitor_id: string | null;
  session_id: string | null;
  country: string | null;
};

const ACTIVE_WINDOW_MIN = 5;
const REFRESH_MS = 20_000;

// Bot UA fragments — case-insensitive match. Covers Googlebot, GoogleOther,
// Applebot, Bingbot, AI crawlers (GPTBot, Claude, Perplexity), social previews, etc.
const BOT_UA_RE = /bot|crawler|spider|googleother|applebot|chatgpt-user|claude-|perplexity|bytespider|facebookexternalhit|whatsapp|embedly|slurp|duckduck|yandex|baidu|ccbot|cohere-ai|diffbot|amazonbot/i;

function isBotUA(ua: string | null | undefined): boolean {
  if (!ua) return true; // empty UA = treat as bot/scraper
  return BOT_UA_RE.test(ua);
}

function classifyRoute(path: string): string {
  if (path === "/") return "/";
  if (/^\/category\/[^/]+$/.test(path)) return "/category/:slug";
  if (/^\/podcast\/[^/]+\/[^/]+$/.test(path)) return "/podcast/:p/:e";
  if (/^\/podcast\/[^/]+$/.test(path)) return "/podcast/:p";
  if (/^\/topic\/[^/]+$/.test(path)) return "/topic/:slug";
  if (/^\/person\/[^/]+$/.test(path)) return "/person/:slug";
  if (/^\/company\/[^/]+$/.test(path)) return "/company/:slug";
  if (/^\/ticker\/[^/]+$/.test(path)) return "/ticker/:s";
  if (/^\/mood\/[^/]+$/.test(path)) return "/mood/:slug";
  return path;
}

function visitorKey(r: Row): string {
  // Prefer durable identifiers. Older rows without visitor_id fall back to URL/path.
  return r.visitor_id || r.user_id || r.full_url || r.path;
}

function flagEmoji(cc: string | null | undefined): string {
  if (!cc || cc.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (cc.charCodeAt(0) - 65), A + (cc.charCodeAt(1) - 65));
}

export default function AdminLivePage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [recent, setRecent] = useState<Row[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [uniqueToday, setUniqueToday] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  // auth
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

  // poller
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const sinceActive = new Date(Date.now() - ACTIVE_WINDOW_MIN * 60_000).toISOString();
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const [{ data: r }, { data: todayRows }] = await Promise.all([
          supabase
            .from("page_events")
            .select("id,path,full_url,user_id,referrer,created_at,user_agent,visitor_id,session_id,country")
            .gte("created_at", sinceActive)
            .order("created_at", { ascending: false })
            .limit(1000),
          supabase
            .from("page_events")
            .select("id,user_agent,visitor_id")
            .gte("created_at", startOfDay.toISOString())
            .limit(50000),
        ]);

        if (cancelled) return;
        const humanRecent = ((r as Row[]) || []).filter((row) => !isBotUA(row.user_agent));
        const humanToday = ((todayRows as { user_agent: string | null; visitor_id: string | null }[]) || []).filter(
          (row) => !isBotUA(row.user_agent),
        );
        const uniqueVisitorsToday = new Set(humanToday.map((r) => r.visitor_id).filter(Boolean)).size;
        setRecent(humanRecent);
        setTodayCount(humanToday.length);
        setUniqueToday(uniqueVisitorsToday);
        setLastRefreshed(new Date());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = window.setInterval(load, REFRESH_MS);
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => { cancelled = true; window.clearInterval(id); window.clearInterval(t); };
  }, [isAdmin]);

  const stats = useMemo(() => {
    const now = Date.now();
    const visitors = new Map<string, { key: string; lastAt: number; lastPath: string; views: number; country: string | null }>();
    recent.forEach((r) => {
      const k = visitorKey(r);
      const ts = new Date(r.created_at).getTime();
      const cur = visitors.get(k);
      if (!cur || ts > cur.lastAt) {
        visitors.set(k, { key: k, lastAt: ts, lastPath: r.path, views: (cur?.views || 0) + 1, country: r.country });
      } else {
        cur.views++;
      }
    });
    const active = Array.from(visitors.values()).sort((a, b) => b.lastAt - a.lastAt);

    const byRoute = new Map<string, number>();
    recent.forEach((r) => {
      const k = classifyRoute(r.path);
      byRoute.set(k, (byRoute.get(k) || 0) + 1);
    });
    const topRoutes = Array.from(byRoute.entries()).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, 8);

    const byPath = new Map<string, number>();
    recent.forEach((r) => {
      byPath.set(r.path, (byPath.get(r.path) || 0) + 1);
    });
    const topPaths = Array.from(byPath.entries()).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, 10);

    const byCountry = new Map<string, number>();
    recent.forEach((r) => {
      const c = r.country || "??";
      byCountry.set(c, (byCountry.get(c) || 0) + 1);
    });
    const topCountries = Array.from(byCountry.entries())
      .map(([k, n]) => ({ k: `${flagEmoji(k)} ${k}`.trim(), n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);

    // pulse last 60s
    const pulse: number[] = new Array(60).fill(0);
    recent.forEach((r) => {
      const ageSec = Math.floor((now - new Date(r.created_at).getTime()) / 1000);
      if (ageSec >= 0 && ageSec < 60) pulse[59 - ageSec]++;
    });

    return { active, topRoutes, topPaths, topCountries, pulse };
  }, [recent, tick]);

  if (!ready) return <Layout><div className="container mx-auto py-20 text-muted-foreground">Loading…</div></Layout>;
  if (!isAdmin) return <Layout><div className="container mx-auto py-20">Not authorized.</div></Layout>;

  const maxPulse = Math.max(1, ...stats.pulse);

  return (
    <Layout>
      <Seo title="Admin · Live — Podiverzum" noindex />
      <div className="container mx-auto py-10 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-semibold flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              Live visitors
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Last {ACTIVE_WINDOW_MIN} min · auto-refresh every {REFRESH_MS / 1000}s
              {lastRefreshed && <> · updated {lastRefreshed.toLocaleTimeString()}</>}
              {loading && <span className="ml-2 text-xs">refreshing…</span>}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Active visitors" value={stats.active.length.toLocaleString()} accent />
          <Stat label="Unique today" value={uniqueToday.toLocaleString()} />
          <Stat label="Pageviews (5 min)" value={recent.length.toLocaleString()} />
          <Stat label="Pageviews today" value={todayCount.toLocaleString()} />
        </div>

        <section>
          <h2 className="font-semibold mb-2">Pulse — last 60 seconds</h2>
          <div className="flex items-end gap-[2px] h-20 p-3 rounded-lg border border-border bg-card">
            {stats.pulse.map((n, i) => (
              <div
                key={i}
                className="flex-1 bg-emerald-500/70 rounded-sm"
                style={{ height: `${(n / maxPulse) * 100}%`, minHeight: n ? 2 : 0 }}
                title={`${60 - i}s ago: ${n} views`}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Who's here right now</h2>
          {stats.active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active visitors in the last {ACTIVE_WINDOW_MIN} minutes.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-xs">
                  <tr>
                    <th className="text-left px-3 py-2">Visitor</th>
                    <th className="text-left px-3 py-2">Country</th>
                    <th className="text-left px-3 py-2">Last page</th>
                    <th className="text-right px-3 py-2">Views</th>
                    <th className="text-right px-3 py-2">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.active.slice(0, 50).map((v) => {
                    const ageSec = Math.max(0, Math.floor((Date.now() - v.lastAt) / 1000));
                    return (
                      <tr key={v.key} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs truncate max-w-[200px]">{v.key.slice(0, 24)}</td>
                        <td className="px-3 py-2 text-xs">{v.country ? `${flagEmoji(v.country)} ${v.country}` : "—"}</td>
                        <td className="px-3 py-2"><a href={v.lastPath} className="hover:underline">{v.lastPath}</a></td>
                        <td className="px-3 py-2 text-right">{v.views}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{ageSec}s ago</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <section>
            <h2 className="font-semibold mb-2">Top routes (last 5 min)</h2>
            <MiniTable rows={stats.topRoutes} />
          </section>
          <section>
            <h2 className="font-semibold mb-2">Top pages (last 5 min)</h2>
            <MiniTable rows={stats.topPaths} linkify />
          </section>
          <section>
            <h2 className="font-semibold mb-2">Countries (last 5 min)</h2>
            <MiniTable rows={stats.topCountries} />
          </section>
        </div>

        <p className="text-xs text-muted-foreground pt-4">
          For 24h breakdowns, UTM, funnel and search insights see{" "}
          <a href="/admin/insights" className="underline hover:text-foreground">Admin · Insights</a>.
        </p>
      </div>
    </Layout>
  );
}

function MiniTable({ rows, linkify = false }: { rows: { k: string; n: number }[]; linkify?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className="border-t border-border first:border-t-0">
              <td className="px-3 py-2">
                {linkify ? <a href={r.k} className="hover:underline">{r.k}</a> : <span className="font-mono text-xs">{r.k}</span>}
              </td>
              <td className="px-3 py-2 text-right w-16">{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`p-4 rounded-lg border bg-card ${accent ? "border-emerald-500/40" : "border-border"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? "text-emerald-500" : ""}`}>{value}</div>
    </div>
  );
}
