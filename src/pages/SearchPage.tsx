import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { PodcastCard, PodcastLite } from "@/components/PodcastCard";
import { EpisodeList, EpisodeLite } from "@/components/EpisodeCard";

import { Seo } from "@/components/Seo";
import { searchEpisodes, parseQuery, normalizeQuery, MATCH_LABEL } from "@/lib/search";
import { episodeScore } from "@/lib/episodeRank";
import NeoSearchBar, { NeoTurn } from "@/components/NeoSearchBar";
import NeoChips, { type NeoChip, isNeoMuted, isRefined, markRefined } from "@/components/NeoChips";
import MatrixRain from "@/components/MatrixRain";

type NeoRefine = { mode: "off" | "ambiguity" | "zero_hit"; message: string; chips: NeoChip[] };

function qHash(q: string): string {
  return q.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

const MATRIX_RE = /^\s*(the\s+)?matrix\s*$/i;

type SortKey = "best" | "newest" | "rank";

const EXAMPLES = [
  "AI regulation",
  "Nvidia data centers",
  "GLP-1 drugs",
  "sleep and recovery",
  "European politics",
  "founder interviews",
];


function escapeIlike(s: string) { return s.replace(/[%,_]/g, " ").replace(/[(),]/g, " "); }

function scorePodcast(p: any, terms: string[], fullPhrase: string): number {
  let s = 0;
  const title = (p.title || "").toLowerCase();
  const displayTitle = (p.display_title || "").toLowerCase();
  const summary = (p.summary || "").toLowerCase();
  const desc = (p.description || "").toLowerCase();
  const cat = (p.category || "").toLowerCase();
  const phrase = fullPhrase.toLowerCase().trim();
  // Full-phrase title hit: huge boost (e.g. "joe rogan" -> "the joe rogan experience")
  if (phrase && phrase.length >= 3) {
    if (title === phrase || displayTitle === phrase) s += 400;
    else if (title.includes(phrase) || displayTitle.includes(phrase)) s += 200;
    else if (summary.includes(phrase)) s += 30;
    else if (desc.includes(phrase)) s += 15;
  }
  terms.forEach((term) => {
    const t = term.toLowerCase();
    if (title === t) s += 50;
    if (title.includes(t)) s += 25;
    if (displayTitle.includes(t)) s += 20;
    if (cat.includes(t)) s += 8;
    if (summary.includes(t)) s += 6;
    if (desc.includes(t)) s += 3;
  });
  return s;
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("q") || "";
  const sortParam = (params.get("sort") as SortKey) || "best";
  const catParam = params.get("cat") || "";
  const [q, setQ] = useState(initial);
  const [podcasts, setPodcasts] = useState<PodcastLite[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [broadened, setBroadened] = useState(false);
  const [semanticUsed, setSemanticUsed] = useState(false);
  const [sectorFallback, setSectorFallback] = useState<{ symbol: string; hint: string; kind: "ticker" | "person" | "company" } | null>(null);
  const [confidenceBand, setConfidenceBand] = useState<"high" | "medium" | "low">("high");
  const [suggestion, setSuggestion] = useState<string>("");
  const [aiAnswer, setAiAnswer] = useState<string>("");
  const [aiAnswerLoading, setAiAnswerLoading] = useState(false);
  const [piFallback, setPiFallback] = useState<{ candidates: any[]; staged: number } | null>(null);
  const [neoTurns, setNeoTurns] = useState<NeoTurn[]>([]);
  const [neoThinking, setNeoThinking] = useState(false);
  const [neoDone, setNeoDone] = useState(false);
  const [neoRefine, setNeoRefine] = useState<NeoRefine | null>(null);
  const neoTurnsRef = useRef<NeoTurn[]>([]);
  const expectChatRef = useRef(false);
  const lastLoggedRef = useRef<string>("");
  const answerAbortRef = useRef<AbortController | null>(null);
  const refineAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const [matrixEgg, setMatrixEgg] = useState(false);
  const matrixSeenRef = useRef<string>("");
  // Refinement extras from Neo chat — appended to the URL `q` to drive search,
  // but NOT shown in the search bar (the bar keeps the original entry).
  const [refineExtra, setRefineExtra] = useState("");
  const effectiveQ = useMemo(
    () => `${initial} ${refineExtra}`.trim(),
    [initial, refineExtra]
  );
  useEffect(() => { neoTurnsRef.current = neoTurns; }, [neoTurns]);

  useEffect(() => {
    if (initial && MATRIX_RE.test(initial) && matrixSeenRef.current !== initial) {
      matrixSeenRef.current = initial;
      setMatrixEgg(true);
    }
  }, [initial]);

  useEffect(() => { setQ(initial); }, [initial]);

  useEffect(() => {
    setBroadened(false);
    setSemanticUsed(false);
    setSectorFallback(null);
    setConfidenceBand("high");
    setSuggestion("");
    setAiAnswer("");
    setPiFallback(null);
    setNeoRefine(null);
    // Neo turns are NOT cleared here — the search effect re-runs on every refined query
    // and we want the chat history to persist. Clear only on a brand-new ?q (handled in onSubmit).
    answerAbortRef.current?.abort();
    refineAbortRef.current?.abort();
    if (!initial) { setPodcasts([]); setEpisodes([]); setAiAnswerLoading(false); return; }
    const q0 = effectiveQ || initial;

    setLoading(true);
    let cancelled = false;
    (async () => {
      let mapped: EpisodeLite[] = [];
      let usedFallback = false;
      let semantic = false;
      let reranked = false;

      const applyHybridResponse = (data: any) => {
        let eps = (data?.episodes || []) as any[];
        if (catParam) eps = eps.filter((e) => (e.podcasts?.category || "") === catParam);
        if (sortParam === "newest") {
          eps.sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());
        } else if (sortParam === "rank") {
          eps.sort((a, b) => episodeScore(b) - episodeScore(a));
        }
        const next = eps.slice(0, 80).map((e) => ({ ...e, matchBadge: e.why_matched ? null : "matched result", why_matched: e.why_matched || null }));
        setCategories(Array.from(new Set(eps.map((e) => e.podcasts?.category).filter(Boolean) as string[])));
        return {
          mapped: next,
          semantic: !!data?.semantic,
          reranked: !!data?.reranked,
          sectorFallback: !!data?.sector_fallback,
          sectorHint: data?.sector_hint || "",
          tickerSymbol: data?.ticker_symbol || "",
          fallbackKind: (data?.fallback_kind as "ticker" | "person" | "company" | null) || null,
          confidenceBand: (data?.confidence_band as "high" | "medium" | "low") || "high",
        };
      };

      // Search v2: hybrid lexical + semantic. Two-phase for fast first paint:
      //   Phase 1: rerank=false → ~1.5-2s, render results.
      //   Phase 2: rerank=true → cache hit instant, else ~3.5s, merge why_matched chips.
      try {
        const phase1 = await supabase.functions.invoke("search-hybrid", {
          body: { q: q0, limit: 80, rerank: false, lang: "en" },
        });
        if (phase1.error) throw phase1.error;
        if (cancelled) return;
        const r1 = applyHybridResponse(phase1.data);
        mapped = r1.mapped;
        semantic = r1.semantic;
        setEpisodes(mapped);
        setSemanticUsed(semantic);
        setConfidenceBand(r1.confidenceBand);
        if (r1.sectorFallback && r1.fallbackKind) {
          setSectorFallback({ symbol: r1.tickerSymbol || initial, hint: r1.sectorHint, kind: r1.fallbackKind });
        }
        setLoading(false);

        // Phase 2: rerank (with cache). Fire-and-forget update.
        supabase.functions.invoke("search-hybrid", {
          body: { q: q0, limit: 80, rerank: true, lang: "en" },
        }).then(({ data: data2, error: err2 }) => {
          if (cancelled || err2 || !data2) return;
          const r2 = applyHybridResponse(data2);
          mapped = r2.mapped;
          reranked = r2.reranked;
          setEpisodes(mapped);
          setSemanticUsed(r2.semantic || r2.reranked);
          setConfidenceBand(r2.confidenceBand);
          if (r2.sectorFallback && r2.fallbackKind) {
            setSectorFallback({ symbol: r2.tickerSymbol || initial, hint: r2.sectorHint, kind: r2.fallbackKind });
          }
        }, () => { /* ignore */ });
      } catch (err) {
        if (cancelled) return;
        console.warn("search-hybrid failed, falling back to legacy", err);
        usedFallback = true;
        const result = await searchEpisodes({ rawQuery: q0, scope: "all", limit: 80, language: "en" });
        if (cancelled) return;
        if (result.suggestion && result.suggestion.toLowerCase() !== q0.toLowerCase()) setSuggestion(result.suggestion);
        let chosen = result.all;
        if (catParam) chosen = chosen.filter((x) => (x.e.podcasts?.category || "") === catParam);
        const ranked =
          sortParam === "newest"
            ? chosen.slice().sort((a: any, b: any) => new Date(b.e.published_at || 0).getTime() - new Date(a.e.published_at || 0).getTime()).slice(0, 80)
            : sortParam === "rank"
            ? chosen.slice().sort((a: any, b: any) => episodeScore(b.e) - episodeScore(a.e)).slice(0, 80)
            : chosen.slice(0, 80);
        mapped = ranked.map((x) => ({ ...x.e, matchBadge: MATCH_LABEL[x.matchType] || "matched result" }));
        semantic = result.semanticUsed;
        usedFallback = result.fallbackUsed || usedFallback;
        setCategories(Array.from(new Set(ranked.map((x) => x.e.podcasts?.category).filter(Boolean) as string[])));
        setEpisodes(mapped);
        setSemanticUsed(semantic);
        setLoading(false);
      }

      setBroadened(usedFallback);

      if (lastLoggedRef.current !== initial) {
        lastLoggedRef.current = initial;
        const { data: sess } = await supabase.auth.getSession();
        const { terms } = parseQuery(normalizeQuery(initial).normalized || initial);
        supabase.from("search_events").insert({
          query: initial.slice(0, 200),
          terms_count: terms.length,
          result_count: mapped.length,
          fallback_used: usedFallback,
          viewport_width: typeof window !== "undefined" ? window.innerWidth : null,
          user_id: sess.session?.user.id || null,
        }).then(() => {}, () => {});
      }

      // Podcasts query (separate, simpler). Includes full-phrase title hit (e.g. "Joe Rogan").
      const { terms } = parseQuery(normalizeQuery(q0).normalized || initial);
      const fullPhrase = q0.trim();
      let pq = supabase
        .from("podcasts")
        .select("id,title,display_title,slug,summary,description,image_url,category,apple_url,spotify_url,youtube_url,website_url,featured,rss_status,podiverzum_rank")
        .limit(60);
      // Full-phrase OR group first (catches "joe rogan" -> "The Joe Rogan Experience")
      if (fullPhrase.length >= 3) {
        const fp = `%${escapeIlike(fullPhrase)}%`;
        pq = pq.or([`title.ilike.${fp}`, `display_title.ilike.${fp}`, `description.ilike.${fp}`, `summary.ilike.${fp}`].join(","));
      }
      terms.forEach((t) => {
        const v = `%${escapeIlike(t)}%`;
        pq = pq.or([`title.ilike.${v}`, `display_title.ilike.${v}`, `description.ilike.${v}`, `summary.ilike.${v}`, `category.ilike.${v}`].join(","));
      });
      const { data: ps } = await pq;
      const visiblePs = (ps || []).filter((p: any) => p.featured || (p.rss_status !== "failed" && p.rss_status !== "inactive"));
      const rankedPs = visiblePs
        .map((p) => ({ p, s: scorePodcast(p, terms, fullPhrase) + ((p.podiverzum_rank ?? 0) * 0.5) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 18)
        .map((x) => x.p);
      setPodcasts(rankedPs);

      // PodcastIndex live fallback: if local DB has 0 podcast title matches and the
      // query looks like a name, ask PI byterm. The fallback fn also stages the
      // best matches into pi_feed_staging so the pipeline ingests them in minutes.
      const looksLikeName = fullPhrase.length >= 3 && /[a-zA-Z]/.test(fullPhrase);
      if (rankedPs.length === 0 && mapped.length === 0 && looksLikeName) {
        supabase.functions.invoke("search-pi-fallback", {
          body: { query: fullPhrase, maxStage: 5 },
        }).then(({ data, error }) => {
          if (cancelled || error || !data?.candidates?.length) return;
          setPiFallback({ candidates: data.candidates, staged: data.staged || 0 });
        }, () => { /* ignore */ });
      }

      // Conversational AI:
      // - If this search was triggered by a user reply (expectChatRef), call search-chat
      //   to produce a contextual reaction + maybe a follow-up.
      // - Otherwise, on the first search ask search-refine for verified disambiguation chips
      //   (silent badge mode), unless the user already refined this query or muted Neo.
      const topResults = mapped.slice(0, 6).map((e: any) => ({
        title: e.display_title || e.title,
        podcast: e.podcasts?.title || "",
        summary: (e.ai_summary || e.summary || "").slice(0, 200),
      }));

      if (expectChatRef.current) {
        expectChatRef.current = false;
        const cctrl = new AbortController();
        chatAbortRef.current = cctrl;
        setNeoThinking(true);
        supabase.functions.invoke("search-chat", {
          body: { messages: neoTurnsRef.current, q: q0, topResults },
        }).then(({ data, error }) => {
          if (cancelled || cctrl.signal.aborted) return;
          setNeoThinking(false);
          if (error) {
            setNeoTurns((t) => [...t, { role: "assistant", content: "locked in." }]);
            setNeoDone(true);
            return;
          }
          const reply = String(data?.reply || "").trim();
          const isDone = data?.done !== false; // default true
          setNeoTurns((t) => [...t, { role: "assistant", content: reply || (isDone ? "locked in." : "which angle?") }]);
          setNeoDone(isDone);
        }, () => {
          setNeoThinking(false);
          setNeoTurns((t) => [...t, { role: "assistant", content: "locked in." }]);
          setNeoDone(true);
        });
      } else if (
        neoTurnsRef.current.length === 0 &&
        !isNeoMuted() &&
        !isRefined(qHash(initial))
      ) {
        // Build the rich payload for chip aggregation from the actual top-50 results.
        const richTop = mapped.slice(0, 50).map((e: any) => ({
          podcastTitle: e.podcasts?.title || "",
          podcastSlug: e.podcasts?.slug || "",
          categoryPrimary: e.podcasts?.category || "",
          people: Array.isArray(e.people) ? e.people : [],
          companies: Array.isArray(e.companies) ? e.companies : [],
          topics: Array.isArray(e.topics) ? e.topics : [],
          publishedAt: e.published_at || null,
        }));
        const rctrl = new AbortController();
        refineAbortRef.current = rctrl;
        supabase.functions.invoke("search-refine", {
          body: {
            q: q0,
            topResults: richTop,
            topTitles: mapped.slice(0, 3).map((e: any) => e.display_title || e.title),
            totalHits: mapped.length,
            strictHitCount: mapped.length, // approximation; semantic-only counts as zero-strict via empty mapped
          },
        }).then(({ data, error }) => {
          if (cancelled || rctrl.signal.aborted || error || !data) return;
          if (data.mode && data.mode !== "off" && Array.isArray(data.chips) && data.chips.length > 0) {
            setNeoRefine(data as NeoRefine);
          }
        }, () => { /* ignore */ });
      }

      // Kick off streaming AI answer when we have enough top results.
      if (mapped.length >= 3) {
        setAiAnswerLoading(true);
        const ctrl = new AbortController();
        answerAbortRef.current = ctrl;
        try {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-answer`;
          const resp = await fetch(url, {
            method: "POST",
            signal: ctrl.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
            body: JSON.stringify({
              q: q0,
              episodes: mapped.slice(0, 6).map((e: any) => ({
                title: e.display_title || e.title,
                podcast: e.podcasts?.title || "",
                summary: e.ai_summary || e.summary || "",
              })),
            }),
          });
          if (resp.ok && resp.body) {
            const reader = resp.body.getReader();
            const dec = new TextDecoder();
            let buf = ""; let acc = ""; let done = false;
            while (!done) {
              const { done: d, value } = await reader.read();
              if (d) break;
              buf += dec.decode(value, { stream: true });
              let nl: number;
              while ((nl = buf.indexOf("\n")) !== -1) {
                let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (!line.startsWith("data: ")) continue;
                const js = line.slice(6).trim();
                if (js === "[DONE]") { done = true; break; }
                try {
                  const p = JSON.parse(js);
                  const c = p?.choices?.[0]?.delta?.content;
                  if (c) { acc += c; setAiAnswer(acc); }
                } catch { buf = line + "\n" + buf; break; }
              }
            }
          }
        } catch (e) {
          if ((e as any)?.name !== "AbortError") console.warn("answer stream", e);
        } finally {
          setAiAnswerLoading(false);
        }
      }
    })();
    return () => { cancelled = true; answerAbortRef.current?.abort(); refineAbortRef.current?.abort(); chatAbortRef.current?.abort(); };
  }, [initial, refineExtra, sortParam, catParam]);

  const flatTerms = useMemo(() => parseQuery(initial).terms, [initial]);

  const setSort = (s: SortKey) => {
    const next = new URLSearchParams(params);
    next.set("q", initial); next.set("sort", s);
    if (catParam) next.set("cat", catParam);
    setParams(next);
  };
  const setCat = (c: string) => {
    const next = new URLSearchParams(params);
    next.set("q", initial);
    if (sortParam) next.set("sort", sortParam);
    if (c) next.set("cat", c); else next.delete("cat");
    setParams(next);
  };

  return (
    <Layout>
      {matrixEgg && <MatrixRain onDone={() => setMatrixEgg(false)} />}
      <Seo
        title={initial ? `${initial} — Podiverzum episode search` : "Search podcast episodes — Podiverzum"}
        description={initial
          ? `Podcast episodes matching "${initial}". Search by topic, person, company, ticker or ingredient.`
          : "Search podcast episodes by topic, person, company, ticker or ingredient."}
        canonical={initial ? `https://podiverzum.com/search?q=${encodeURIComponent(initial)}` : "https://podiverzum.com/search"}
        noindex
      />
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-semibold mb-2">Search episodes</h1>
        <p className="text-muted-foreground mb-4 text-sm">
          Search by topic, guest, company, show, ticker or idea.
        </p>
        <div className="sticky top-[calc(env(safe-area-inset-top)+4.75rem)] z-30 -mx-4 px-4 py-2 bg-background/95 backdrop-blur sm:static sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none">
          <NeoSearchBar
            value={q}
            onChange={setQ}
            onSubmit={(v) => {
              chatAbortRef.current?.abort();
              refineAbortRef.current?.abort();
              setNeoTurns([]);
              setNeoDone(false);
              setNeoThinking(false);
              expectChatRef.current = false;
              setRefineExtra("");
              setParams({ q: v });
              window.scrollTo({ top: 0, behavior: "auto" });
            }}
            onReply={(reply) => {
              // Append the user's turn immediately for instant feedback.
              setNeoTurns((t) => [...t, { role: "user", content: reply }]);
              // Refinement extras are kept INTERNALLY so the search bar stays clean.
              // The bar continues to show the original ?q query the user typed.
              const nextExtra = `${refineExtra} ${reply}`.trim();
              expectChatRef.current = true;
              setNeoThinking(true);
              if (nextExtra !== refineExtra) {
                setRefineExtra(nextExtra);
              } else {
                // No-op refinement — chat-only round.
                supabase.functions.invoke("search-chat", {
                  body: { messages: [...neoTurnsRef.current, { role: "user", content: reply }], q: `${initial} ${nextExtra}`.trim(), topResults: [] },
                }).then(({ data, error }) => {
                  setNeoThinking(false);
                  if (error) {
                    setNeoTurns((t) => [...t, { role: "assistant", content: "locked in." }]);
                    setNeoDone(true);
                    return;
                  }
                  const r = String(data?.reply || "").trim();
                  const isDone = data?.done !== false;
                  setNeoTurns((t) => [...t, { role: "assistant", content: r || (isDone ? "locked in." : "which angle?") }]);
                  setNeoDone(isDone);
                }, () => {
                  setNeoThinking(false);
                  setNeoTurns((t) => [...t, { role: "assistant", content: "locked in." }]);
                  setNeoDone(true);
                });
                expectChatRef.current = false;
              }
              window.scrollTo({ top: 0, behavior: "auto" });
            }}
            turns={neoTurns}
            thinking={neoThinking}
            done={neoDone}
            onExitAI={() => {
              chatAbortRef.current?.abort();
              setNeoTurns([]);
              setNeoDone(false);
              setNeoThinking(false);
              expectChatRef.current = false;
            }}
            placeholder="e.g. Nvidia data centers"
          />
          {neoRefine && neoTurns.length === 0 && (
            <NeoChips
              mode={neoRefine.mode === "off" ? "ambiguity" : neoRefine.mode}
              message={neoRefine.message}
              chips={neoRefine.chips}
              defaultExpanded={neoRefine.mode === "zero_hit"}
              onPick={(chip) => {
                markRefined(qHash(initial));
                setNeoRefine(null);
                const next = `${refineExtra} ${chip.query}`.trim();
                setRefineExtra(next);
                window.scrollTo({ top: 0, behavior: "auto" });
              }}
              onDismiss={() => {
                markRefined(qHash(initial));
                setNeoRefine(null);
              }}
            />
          )}
          <details className="mt-2 text-xs text-muted-foreground max-w-2xl">
            <summary className="cursor-pointer hover:text-foreground">Advanced search tips</summary>
            <p className="mt-2">
              Use <code className="px-1 bg-secondary rounded">+</code> before a word to require it,
              for example <code className="px-1 bg-secondary rounded">+Nvidia GPU</code>.
              Use quotes for exact phrases.
            </p>
          </details>
        </div>

        {!initial && (
          <div className="flex flex-wrap gap-2 mt-3">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => { setQ(ex); setParams({ q: ex }); }}
                className="px-3 py-1 rounded-full bg-secondary text-xs hover:bg-accent hover:text-accent-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {initial && (
          <div className="hidden sm:flex flex-wrap gap-2 items-center mt-6 text-xs">
            <span className="text-muted-foreground">Sort:</span>
            {([
              ["best", "Best match"],
              ["newest", "Newest"],
              ["rank", "Highest episode rank"],
            ] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`px-2.5 py-1 rounded-full border ${sortParam === k ? "bg-foreground text-background border-foreground" : "bg-card border-border hover:border-foreground/40"}`}
              >
                {l}
              </button>
            ))}
            {categories.length > 1 && (
              <>
                <span className="text-muted-foreground ml-2">Category:</span>
                <button onClick={() => setCat("")} className={`px-2.5 py-1 rounded-full border ${!catParam ? "bg-foreground text-background border-foreground" : "bg-card border-border hover:border-foreground/40"}`}>All</button>
                {categories.slice(0, 8).map((c) => (
                  <button key={c} onClick={() => setCat(c)} className={`px-2.5 py-1 rounded-full border ${catParam === c ? "bg-foreground text-background border-foreground" : "bg-card border-border hover:border-foreground/40"}`}>{c}</button>
                ))}
              </>
            )}
          </div>
        )}

        {initial && !loading && (aiAnswer || aiAnswerLoading) && (
          <div className="mt-6 sm:mt-8 p-4 sm:p-5 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">AI overview</span>
              {aiAnswerLoading && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
              )}
            </div>
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {aiAnswer || <span className="text-muted-foreground">Synthesizing an overview from the top episodes…</span>}
            </p>
            <p className="text-[10px] text-muted-foreground mt-2">AI summary, may contain errors. Numbers reference the episodes below.</p>
          </div>
        )}

        {initial && loading && (
          <div className="mt-10 p-6 border border-border rounded-lg bg-card">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-hidden />
              <div className="text-sm">
                <div className="font-medium">Searching for “{initial}”…</div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  Generating a quick overview…
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-14 rounded-md bg-muted/60 animate-pulse" />
              <div className="h-14 rounded-md bg-muted/40 animate-pulse" />
              <div className="h-14 rounded-md bg-muted/30 animate-pulse" />
            </div>
          </div>
        )}

        {initial && !loading && podcasts.length === 0 && episodes.length === 0 && (
          <div className="mt-10 p-6 border border-border rounded-lg bg-card text-sm text-muted-foreground">
            No matches yet. Try a broader phrase, a name, a company or a topic.{suggestion && suggestion.toLowerCase() !== initial.toLowerCase() && (<> Did you mean <button onClick={() => { setQ(suggestion); setParams({ q: suggestion }); }} className="underline text-foreground font-medium">{suggestion}</button>?</>)}
          </div>
        )}

        {initial && !loading && piFallback && piFallback.candidates.length > 0 && podcasts.length === 0 && (
          <div className="mt-8 p-5 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {piFallback.staged > 0 ? "Coming soon" : "Found in external sources"}
              </span>
              {piFallback.staged > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
              )}
            </div>
            <p className="text-sm text-foreground/80 mb-3">
              We didn't have these in our index yet. {piFallback.staged > 0
                ? `We just queued ${piFallback.staged} for indexing — episodes should appear within a few minutes.`
                : "They're already queued."}
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {piFallback.candidates.slice(0, 6).map((c, i) => {
                const inner = (
                  <div className="flex gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors h-full">
                    {c.image_url && (
                      <img src={c.image_url} alt={c.title} loading="lazy"
                        className="w-14 h-14 rounded-md object-cover shrink-0 border border-border/60" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm leading-tight line-clamp-2">{c.title}</div>
                      {c.author && <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{c.author}</div>}
                      <div className="text-[10px] mt-1.5 inline-flex items-center gap-1">
                        {c.status === "indexed" && <span className="text-primary font-medium">Available →</span>}
                        {c.status === "staged" && <span className="text-muted-foreground">Coming soon</span>}
                        {c.status === "new" && <span className="text-muted-foreground">Coming soon</span>}
                      </div>
                    </div>
                  </div>
                );
                return c.status === "indexed" && c.podcast_slug ? (
                  <Link key={i} to={`/podcast/${c.podcast_slug}`}>{inner}</Link>
                ) : (
                  <div key={i}>{inner}</div>
                );
              })}
            </div>
          </div>
        )}

        {(() => {
          const phrase = initial.trim().toLowerCase();
          // Word-boundary match so "ETH" doesn't promote "Ethics" / "Methodology".
          const phraseRe = phrase.length >= 3
            ? new RegExp(`(^|[^\\p{L}\\p{N}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "iu")
            : null;
          const heroPodcast = !loading && phraseRe && podcasts.find((p) => {
            const t = (p.title || "");
            const d = ((p as any).display_title || "");
            return phraseRe.test(t) || phraseRe.test(d);
          });
          if (!heroPodcast) return null;
          const title = (heroPodcast as any).display_title || heroPodcast.title;
          return (
            <div className="mt-8">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-2">Top podcast match</div>
              <Link
                to={`/podcast/${heroPodcast.slug}`}
                className="flex gap-4 p-4 rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card hover:border-primary/70 transition-colors"
              >
                {heroPodcast.image_url && (
                  <img src={heroPodcast.image_url} alt={title} loading="lazy"
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shrink-0 border border-border/60" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-base sm:text-lg leading-tight line-clamp-2">{title}</div>
                  {heroPodcast.category && <div className="text-xs text-muted-foreground mt-1">{heroPodcast.category}</div>}
                  {(heroPodcast.seo_description || heroPodcast.summary || heroPodcast.description) && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1.5">
                      {heroPodcast.seo_description || heroPodcast.summary || heroPodcast.description}
                    </p>
                  )}
                  <div className="text-[11px] text-primary font-medium mt-2">View podcast →</div>
                </div>
              </Link>
            </div>
          );
        })()}


        {initial && !loading && (podcasts.length > 0 || episodes.length > 0) && (() => {
          const phrase = initial.trim().toLowerCase();
          const phraseRe = phrase.length >= 3
            ? new RegExp(`(^|[^\\p{L}\\p{N}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "iu")
            : null;
          const heroId = phraseRe ? podcasts.find((p) => {
            const t = (p.title || "");
            const d = ((p as any).display_title || "");
            return phraseRe.test(t) || phraseRe.test(d);
          })?.id : undefined;
          const podcastsList = heroId ? podcasts.filter((p) => p.id !== heroId) : podcasts;
          const podcastsSection = podcastsList.length > 0 && (
            <section>
              <h2 className="font-semibold mb-3">{heroId ? "More matching podcasts" : "Matching podcasts"} ({podcastsList.length})</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {podcastsList.map((p) => <PodcastCard key={p.id} p={p} />)}
              </div>
            </section>
          );
          const episodesSection = episodes.length > 0 && (
            <section>
              <h2 className="font-semibold mb-3 flex items-center gap-2 flex-wrap">
                Matching episodes ({episodes.length})
                {suggestion && suggestion.toLowerCase() !== initial.toLowerCase() && (
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    Showing results for {suggestion}
                  </span>
                )}
                {sectorFallback && (
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-foreground/70">
                    {sectorFallback.kind === "ticker"
                      ? `No exact mentions of ${sectorFallback.symbol} — showing related episodes about ${sectorFallback.hint}`
                      : `No exact mentions of "${sectorFallback.symbol}" — showing related episodes about ${sectorFallback.hint}`}
                  </span>
                )}
                {!sectorFallback && confidenceBand === "low" && episodes.length > 0 && (
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                    Loose matches — try a more specific query
                  </span>
                )}
                {!sectorFallback && confidenceBand === "medium" && (
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    Some loose matches included
                  </span>
                )}
                {semanticUsed && !sectorFallback && confidenceBand === "high" && (
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-foreground/70">
                    including related ideas
                  </span>
                )}
                {broadened && !semanticUsed && (
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    Showing broader matches
                  </span>
                )}
              </h2>
              <EpisodeList items={episodes} terms={flatTerms} showEntities searchQuery={initial} />
            </section>
          );
          return (
            <div className="mt-8 space-y-10">
              {episodesSection}
              {podcastsSection}
            </div>
          );
        })()}

        <p className="text-xs text-muted-foreground mt-10">
          Indexed from public RSS feeds. Ranked by relevance, freshness, feed health and source quality.
        </p>
      </div>
    </Layout>
  );
}
