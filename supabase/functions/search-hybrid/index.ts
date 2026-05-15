// Search v2 hybrid endpoint: lexical (tsv+trgm) + semantic (vector RRF) + AI re-rank.
// Now also: AI query understanding (cached) + per-result "why matched" snippets.
// POST { q: string, limit?: number, lang?: 'en'|'hu'|null, rerank?: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { understandQuery, buildExpandedQuery, type Understanding } from "../_shared/search-understand.ts";
import { loadCuratedSynonyms } from "../_shared/search-synonyms.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

const EPISODE_SELECT =
  "id,title,slug,published_at,summary,description,ai_summary,topics,people,companies,tickers,ingredients,audio_url,podcast_id,podcasts!inner(slug,title,image_url,category,podiverzum_rank,rank_label,rss_status,language)";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => { console.warn(`${label} timeout ${ms}ms`); resolve(null); }, ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); console.warn(`${label} err`, e); resolve(null); });
  });
}

function normalizeQ(q: string): string {
  return q.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
}

const MARKET_SYMBOL_ALIASES: Record<string, string[]> = {
  eth: ["Ethereum", "Ether"],
  btc: ["Bitcoin"],
  sol: ["Solana"],
  xrp: ["XRP Ledger", "Ripple"],
  ada: ["Cardano"],
  doge: ["Dogecoin"],
  avax: ["Avalanche"],
  link: ["Chainlink"],
  dot: ["Polkadot"],
  matic: ["Polygon"],
  // US equities — recent/obscure tickers small AI models often miss.
  nbis: ["Nebius", "Nebius Group"],
  asts: ["AST SpaceMobile"],
  smci: ["Super Micro Computer", "Supermicro"],
  pltr: ["Palantir"],
  rddt: ["Reddit"],
  arm: ["Arm Holdings"],
  coin: ["Coinbase"],
  hood: ["Robinhood"],
  rivn: ["Rivian"],
  lcid: ["Lucid Motors"],
  mstr: ["MicroStrategy"],
  nvda: ["Nvidia"],
  tsla: ["Tesla"],
  amd: ["AMD", "Advanced Micro Devices"],
  meta: ["Meta", "Facebook"],
  goog: ["Google", "Alphabet"],
  googl: ["Google", "Alphabet"],
  msft: ["Microsoft"],
  aapl: ["Apple"],
  amzn: ["Amazon"],
  nflx: ["Netflix"],
  tsm: ["TSMC", "Taiwan Semiconductor"],
};

const COMMON_NON_TICKER_ACRONYMS = new Set(["AI", "AR", "EU", "IT", "ML", "UK", "US", "UX", "VR"]);

// Stop-words excluded from rare-token MUST gate (common English + podcast filler).
const RARE_GATE_STOPWORDS = new Set([
  // articles / aux / pronouns
  "a","an","the","is","am","are","was","were","be","been","being","do","does","did","done",
  "has","have","had","having","of","in","on","at","to","by","as","or","if","it","its","i","me","my",
  "we","us","our","he","she","him","her","his","they","them","their","you","your","yours","myself",
  // conjunctions / prepositions / qualifiers
  "and","but","not","no","so","up","off","out","into","over","under","than","then","also","only","very",
  "for","with","that","this","from","what","when","where","how","why","who","which","whom","whose",
  // podcast filler
  "podcast","podcasts","episode","episodes","show","shows","talk","talks","about","best","top","new",
  "latest","good","great","like","just","one","two","three","all","any","some","more","most","much","even",
]);

// Pure-noise patterns: single repeated char (aaaaa), keyboard mashes, alphanum mix without vowels.
function looksLikeGibberish(t: string): boolean {
  if (t.length < 4) return false;
  // single-char repetition
  if (/^(.)\1{3,}$/.test(t)) return true;
  // letter+digit mix that isn't a known token shape (e.g. "12345abc", "abc123xyz")
  if (/[a-z]/.test(t) && /\d/.test(t) && t.length <= 10 && !/^[a-z]+\d{1,4}$/.test(t)) {
    // exclude common patterns like "gpt4", "h100", "rtx4090"
    if (!/^(gpt|llama|claude|gemini|rtx|gtx|h|a|b|m|i|core|ipv|ip|mp|mp3|mp4|h264|h265|w|wd|sd|hd)\d/.test(t)) return true;
  }
  // long token with no vowels (rough keyboard-mash heuristic)
  if (t.length >= 6 && !/[aeiouy]/.test(t)) return true;
  return false;
}

// Tokenize raw query for IDF lookup. Skip ticker symbols (own gate), short tokens, stopwords.
function tokenizeForRareGate(q: string, isTickerQ: boolean): string[] {
  if (isTickerQ) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of q.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/)) {
    const t = raw.trim();
    // v9: lowered to 3 chars so short gibberish ("xyz123") still gates.
    if (t.length < 3 || t.length > 30) continue;
    if (RARE_GATE_STOPWORDS.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 6) break;
  }
  return out;
}

// Sector hints for ticker zero-hit fallback. When no episode mentions a
// ticker / company, we re-embed using "{Company} {sector hint}" and run a
// semantic-only search so users see topically related episodes (e.g. for
// NBIS → AI cloud / GPU infra) instead of a useless empty page or random
// vector neighbors of the bare symbol ("NBIS" → "Nobel" cluster).
const MARKET_SYMBOL_SECTORS: Record<string, string> = {
  nbis: "AI cloud computing GPU infrastructure data centers hyperscaler",
  asts: "satellite communications space-based mobile broadband",
  smci: "AI server hardware data center GPU infrastructure",
  pltr: "data analytics enterprise AI software defense tech",
  rddt: "social media online communities user-generated content",
  arm: "semiconductor chip design ARM architecture mobile processors",
  coin: "cryptocurrency exchange digital assets bitcoin trading",
  hood: "retail trading brokerage fintech investing app",
  rivn: "electric vehicles EV trucks automotive startups",
  lcid: "luxury electric vehicles EV automotive",
  mstr: "bitcoin treasury enterprise software cryptocurrency",
  nvda: "GPU AI chips semiconductor accelerated computing",
  tsla: "electric vehicles autonomous driving energy storage",
  amd: "semiconductor CPU GPU chips data center",
  meta: "social media VR augmented reality advertising platform",
  goog: "search advertising cloud computing AI Android",
  googl: "search advertising cloud computing AI Android",
  msft: "cloud computing Azure enterprise software AI Copilot",
  aapl: "consumer electronics iPhone services ecosystem",
  amzn: "ecommerce AWS cloud computing logistics",
  nflx: "streaming video entertainment subscription content",
  tsm: "semiconductor foundry chip manufacturing advanced nodes",
  eth: "ethereum smart contracts DeFi blockchain",
  btc: "bitcoin cryptocurrency digital gold store of value",
  sol: "solana blockchain web3 high-performance L1",
  xrp: "ripple cross-border payments crypto",
  doge: "dogecoin meme cryptocurrency",
  avax: "avalanche blockchain L1 DeFi",
};

// Detect a US-style ticker even when surrounded by helper words.
// Accepts: "NBIS", "$NBIS", "NBIS stock", "stock NBIS", "NBIS shares",
// "NBIS részvény", "NBIS ticker". Strips $ prefix and trailing/leading
// helper words then re-checks the symbol pattern.
const TICKER_HELPER_WORDS = new Set([
  "stock","stocks","share","shares","ticker","equity","equities",
  "részvény","reszveny","részvények","reszvenyek","papír","papir",
  "price","quote","chart",
]);
function compactMarketSymbol(q: string): string | null {
  // v7: Only treat as ticker if user signals ticker intent — either `$`-prefix
  // or ALL-CAPS token. Bare title-case words like "Apple", "Tesla", "Meta"
  // are brand queries, not ticker queries (vector + entity pinning handle them).
  const trimmed = q.trim();
  const hadDollar = trimmed.startsWith("$");
  const t = trimmed.replace(/^\$/, "");
  const isAllCaps = (s: string) => s === s.toUpperCase() && /[A-Z]/.test(s);
  if (/^[A-Za-z]{2,5}(\.[A-Za-z])?$/.test(t)) {
    if (hadDollar || isAllCaps(t)) return t.toUpperCase();
    return null;
  }
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts.length <= 4) {
    const core = parts.filter((p) => !TICKER_HELPER_WORDS.has(p.toLowerCase()));
    if (core.length === 1 && /^[A-Za-z]{2,5}(\.[A-Za-z])?$/.test(core[0])) {
      // Multi-word with helper words ("NBIS stock", "$TSLA") → ticker-ish intent
      if (hadDollar || isAllCaps(core[0])) return core[0].toUpperCase();
    }
  }
  return null;
}

function uniqueClean(values: string[], max = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = String(raw || "").trim();
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function quoteWebSearchTerm(term: string): string {
  return term.includes(" ") ? `"${term.replace(/"/g, " ").trim()}"` : term;
}

async function embedRaw(q: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: q }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: 768,
      }),
    });
    if (!r.ok) { console.warn("embed http", r.status); return null; }
    const j = await r.json();
    const v = j?.embedding?.values as number[] | undefined;
    return v && v.length === 768 ? v : null;
  } catch (e) { console.warn("embed err", e); return null; }
}
const embed = (q: string) => withTimeout(embedRaw(q), 1800, "embed");

async function rerankWithReasons(q: string, items: any[]): Promise<{ ids: string[]; why: Record<string, string> } | null> {
  if (!LOVABLE_API_KEY || items.length < 5) return null;
  const top = items.slice(0, 30);
  const compact = top.map((e, i) => ({
    i, id: e.id,
    t: (e.title || "").slice(0, 140),
    s: (e.ai_summary || e.summary || "").slice(0, 220),
    p: e.podcasts?.title?.slice(0, 60) ?? "",
  }));
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You re-rank podcast episodes by relevance and explain why each top result matches in <12 words." },
          { role: "user", content: `Query: ${q}\nCandidates: ${JSON.stringify(compact)}\nReturn the top 15 most relevant ids in order, each with a one-line why_matched.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "rank",
            parameters: {
              type: "object", additionalProperties: false,
              properties: {
                results: {
                  type: "array",
                  maxItems: 15,
                  items: {
                    type: "object", additionalProperties: false,
                    properties: { id: { type: "string" }, why: { type: "string" } },
                    required: ["id", "why"],
                  },
                },
              },
              required: ["results"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "rank" } },
      }),
    });
    if (!r.ok) { console.warn("rerank http", r.status); return null; }
    const j = await r.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = typeof args === "string" ? JSON.parse(args) : args;
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    const ids = results.map((r: any) => r.id).filter(Boolean);
    const why: Record<string, string> = {};
    for (const r of results) if (r?.id && r?.why) why[r.id] = String(r.why).slice(0, 160);
    return { ids, why };
  } catch (e) { console.warn("rerank err", e); return null; }
}
const rerank = (q: string, items: any[]) => withTimeout(rerankWithReasons(q, items), 7000, "rerank");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    let q = String(body.q || "").trim();
    const limit = Math.min(80, Math.max(5, Number(body.limit) || 50));
    const lang = body.lang === null ? null : (typeof body.lang === "string" ? body.lang : "en");
    const wantRerank = body.rerank !== false;

    if (!q) return new Response(JSON.stringify({ episodes: [], reason: "empty" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const t0 = Date.now();
    let qNorm = normalizeQ(q);

    // v4/v9: Stopword + gibberish gate. Bail before AI/embedding for queries
    // that obviously can't have results ("the", "is", "of", "asdfghjkl", "qqqqqqq").
    {
      const tokens = qNorm.split(/[^a-z0-9]+/).filter((t) => t.length >= 1);
      const meaningful = tokens.filter((t) => t.length >= 2 && !RARE_GATE_STOPWORDS.has(t) && !/^\d+$/.test(t));
      const allGibberish = meaningful.length > 0 && meaningful.every((t) => looksLikeGibberish(t));
      if (tokens.length > 0 && (meaningful.length === 0 || allGibberish)) {
        return new Response(JSON.stringify({
          episodes: [],
          timing: { embed_ms: 0, rpc_ms: 0, total_ms: Date.now() - t0 },
          confidence_band: "low",
          stopword_gate: meaningful.length === 0,
          gibberish_gate: allGibberish,
          reason: allGibberish ? "gibberish_only" : "stopwords_only",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // 1) Cache lookup (understanding + embedding + rerank) — 7d understanding, 24h rerank
    let understanding: Understanding | null = null;
    let q_embedding: number[] | null = null;
    let cachedRerank: { ids: string[]; why: Record<string, string> } | null = null;
    let cacheHit = false;
    try {
      const { data: cached } = await supa
        .from("search_query_cache")
        .select("understanding, embedding, updated_at, rerank, rerank_updated_at")
        .eq("q_norm", qNorm)
        .maybeSingle();
      if (cached && cached.updated_at && Date.now() - new Date(cached.updated_at).getTime() < 7 * 24 * 3600 * 1000) {
        understanding = cached.understanding as Understanding;
        if (typeof cached.embedding === "string") {
          try {
            const arr = JSON.parse(cached.embedding);
            if (Array.isArray(arr) && arr.length === 768) q_embedding = arr as number[];
          } catch { /* ignore */ }
        } else if (Array.isArray(cached.embedding) && cached.embedding.length === 768) {
          q_embedding = cached.embedding as number[];
        }
        cacheHit = true;
      }
      // Rerank cache: 24h TTL, independent of understanding cache
      if (cached?.rerank && cached.rerank_updated_at && Date.now() - new Date(cached.rerank_updated_at).getTime() < 24 * 3600 * 1000) {
        const r = cached.rerank as any;
        if (Array.isArray(r?.ids) && r.ids.length) {
          cachedRerank = { ids: r.ids, why: (r.why && typeof r.why === "object") ? r.why : {} };
        }
      }
    } catch (e) { console.warn("cache read err", e); }

    // Ticker queries: if cached understanding lacks a multi-word company name
    // (e.g. only `["ASTS"]` from a previous bug), force a fresh AI call so we
    // can recover the company name (e.g. "AST SpaceMobile") for the MUST-gate fallback.
    const marketSymbol = compactMarketSymbol(q);
    const symbolAliases = marketSymbol ? (MARKET_SYMBOL_ALIASES[marketSymbol.toLowerCase()] || []) : [];
    const isTickerQ = !!marketSymbol && !COMMON_NON_TICKER_ACRONYMS.has(marketSymbol);
    if (isTickerQ && understanding) {
      const hasCompany = (understanding.entities || []).some((e) => typeof e === "string" && e.includes(" "));
      if (!hasCompany && !symbolAliases.length) understanding = null;
    }

    // 2) Parallel: understanding (if missing) + embedding (if missing) + curated synonyms (always cheap)
    const [u, embVal, curated] = await Promise.all([
      understanding ? Promise.resolve(understanding) : understandQuery(q, 700),
      q_embedding ? Promise.resolve(q_embedding) : embed(q),
      loadCuratedSynonyms(supa, qNorm),
    ]);
    understanding = u as Understanding;
    if (!q_embedding) q_embedding = embVal;
    const tEmb = Date.now() - t0;

    // Ticker override: if raw query is a US-style ticker symbol (e.g. ASTS, NVDA, BRK.B),
    // force a ticker-intent understanding so the MUST-gate locks results to episodes
    // that actually mention the symbol — instead of letting the AI expand "ASTS" into
    // astrology / unrelated semantic neighbors.
    if (isTickerQ && marketSymbol) {
      const sym = marketSymbol;
      // Preserve AI-discovered entities (e.g. "AST SpaceMobile" for "ASTS") so
      // the MUST-gate fallback can search by company name when no episode
      // mentions the bare ticker symbol. Also merge curated synonym mappings
      // (deterministic ticker→company table) — small AI models often fail to
      // recognize obscure tickers like ASTS.
      const aiEntities = (understanding?.entities || []).filter((e) => e && e.toUpperCase() !== sym);
      const curatedCompanies = (curated.expansions || []).filter((e) => e && e.toUpperCase() !== sym);
      const resolvedNames = uniqueClean([...symbolAliases, ...curatedCompanies, ...aiEntities], 10);
      understanding = {
        entities: uniqueClean([sym, ...resolvedNames], 8),
        expanded_terms: uniqueClean([sym, ...resolvedNames], 8),
        synonyms: [],
        intent: "ticker",
        language: understanding?.language || "en",
      };
      // Bust any stale rerank cache for this query (previous astrology-poisoned ranking).
      cachedRerank = null;
    }

    // 3) Persist to cache (fire and forget). Always upsert for ticker queries
    // so refreshed understanding (with company name) overwrites stale entries.
    if (!cacheHit || isTickerQ) {
      supa.from("search_query_cache").upsert({
        q_norm: qNorm,
        understanding: understanding,
        embedding: q_embedding ? `[${q_embedding.join(",")}]` : null,
        updated_at: new Date().toISOString(),
      }).then(() => {}, (e) => console.warn("cache write", e));
    } else {
      supa.from("search_query_cache").update({ hits: 1, updated_at: new Date().toISOString() }).eq("q_norm", qNorm).then(() => {}, () => {});
    }

    // 4) Hybrid RPC.
    // Lexical side: use the RAW user query. websearch_to_tsquery AND-s tokens together,
    //   so adding AI/curated expansion shrinks recall to ~0 for entity queries. The expansion
    //   value is captured by the semantic side (vectors) instead.
    // Semantic side: original q_embedding (built from raw q).
    const aiExpanded = buildExpandedQuery(q, understanding); // kept for cache/debug only
    const expanded = curated.expansions.length
      ? `${aiExpanded} ${curated.expansions.join(" ")}`.slice(0, 700)
      : aiExpanded;

    // Industry-standard hybrid tuning (Supabase/Vespa/Weaviate recipe):
    // - required_terms: rare-token MUST gate. Entities from query MUST appear in search_text.
    // - entity_terms: same set, used for exact-match boost on episode entity arrays.
    // - alpha_lex: dynamic lex/sem weight. Entity-rich → 0.65, broad topical → 0.45.
    const rawEntities = (understanding?.entities || [])
      .map((s) => String(s || "").trim())
      .filter((s) => s.length >= 3 && s.length <= 60);
    const resolvedMarketTerms = isTickerQ && marketSymbol
      ? uniqueClean([
          marketSymbol,
          ...symbolAliases,
          ...(curated.expansions || []),
          ...rawEntities.filter((t) => t.toUpperCase() !== marketSymbol),
        ], 8)
      : [];
    const strictCandidateTerms = isTickerQ && resolvedMarketTerms.length
      ? [
          resolvedMarketTerms.find((t) => t.includes(" "))
            || resolvedMarketTerms.find((t) => t.toUpperCase() !== marketSymbol)
            || resolvedMarketTerms[0],
        ].filter(Boolean) as string[]
      : rawEntities;
    const requiredTermsBase = strictCandidateTerms
      .slice()
      .sort((a, b) => b.length - a.length)
      .slice(0, 4);

    // Rare-token MUST gate (universal): any token in the raw query that is rare
    // in the corpus (low document frequency) becomes mandatory. This kills the
    // "Nbis → Nobel cluster" failure mode globally — uncommon names/terms
    // can no longer be silently dropped by the AI expansion.
    const rareGateTokens = tokenizeForRareGate(q, isTickerQ);
    let rareTokens: string[] = [];
    let unknownTokens: string[] = [];
    let unknownTokenCount = 0; // df === 0 confirmed
    let idfRpcOk = false;
    if (rareGateTokens.length) {
      try {
        const { data: idfRows, error: idfErr } = await supa.rpc("token_idf", { p_tokens: rareGateTokens });
        if (idfErr) throw idfErr;
        idfRpcOk = true;
        const RARE_THRESHOLD = 200; // ~0.03% of 700k corpus
        const UNKNOWN_THRESHOLD = 1; // v5b: only df=0 counts as truly unknown (gibberish)
        const rows = ((idfRows as Array<{ token: string; df: number }>) || []);
        rareTokens = rows.filter((r) => r.df > 0 && r.df < RARE_THRESHOLD).map((r) => r.token);
        const dfMap = new Map(rows.map((r) => [r.token, r.df]));
        unknownTokens = rareGateTokens.filter((t) => {
          const df = dfMap.get(t);
          return df === undefined ? true : df < UNKNOWN_THRESHOLD;
        });
        unknownTokenCount = unknownTokens.length;
      } catch (e) { console.warn("token_idf err", e); }
    }

    // v11: Spell-correction layer. Before declaring "no known tokens", try
    // pg_trgm fuzzy-match each unknown token against the corpus token cache
    // (df>=50, similarity>=0.6). If at least one swap recovers a known
    // token, rewrite q + qNorm and re-embed so the rest of the pipeline
    // uses the corrected query. Skip uppercase tokens (likely tickers/acronyms).
    const spellCorrections: Array<{ from: string; to: string }> = [];
    const rawEntitiesPre = (understanding?.entities || [])
      .map((s) => String(s || "").trim())
      .filter((s) => s.length >= 3 && s.length <= 60);
    const trustedEntitiesPre = rawEntitiesPre.filter((e) => {
      if (e.includes(" ")) return true;
      const tk = e.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      return !(tk.length === 1 && rareGateTokens.includes(tk[0]));
    });
    if (idfRpcOk && !isTickerQ && unknownTokens.length > 0 && trustedEntitiesPre.length === 0) {
      const correctable = unknownTokens.filter((t) => {
        const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        const m = q.match(re);
        if (m && /[A-Z]/.test(m[0])) return false;
        return t.length >= 4 && /^[a-z]+$/.test(t);
      });
      if (correctable.length) {
        try {
          const { data: sugRows } = await supa.rpc("suggest_token_corrections", { p_tokens: correctable });
          const sugs = (sugRows as Array<{ token: string; suggestion: string; similarity: number }> | null) || [];
          for (const s of sugs) if (s?.token && s?.suggestion && s.token !== s.suggestion) {
            spellCorrections.push({ from: s.token, to: s.suggestion });
          }
        } catch (e) { console.warn("spell rpc err", e); }
      }
      if (spellCorrections.length) {
        let rewritten = q;
        for (const c of spellCorrections) {
          rewritten = rewritten.replace(new RegExp(`\\b${c.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), c.to);
        }
        // Mutate q + qNorm so the rest of the pipeline uses the corrected text.
        q = rewritten;
        qNorm = normalizeQ(rewritten);
        // Re-embed (best effort); fall back to original embedding on failure.
        const newEmb = await embed(rewritten);
        if (newEmb) q_embedding = newEmb;
        // Re-run IDF on corrected tokens.
        const newGateTokens = tokenizeForRareGate(rewritten, false);
        try {
          const { data: idfRows2 } = await supa.rpc("token_idf", { p_tokens: newGateTokens });
          const rows2 = ((idfRows2 as Array<{ token: string; df: number }>) || []);
          rareTokens = rows2.filter((r) => r.df > 0 && r.df < 200).map((r) => r.token);
          const df2 = new Map(rows2.map((r) => [r.token, r.df]));
          unknownTokens = newGateTokens.filter((t) => (df2.get(t) ?? 0) < 1);
          unknownTokenCount = unknownTokens.length;
        } catch { /* ignore */ }
      }
    }

    // v9: Nonsense gate. If every meaningful token is unknown to the corpus,
    // bail. AI-hallucinated entities (e.g. AI echoing "xyzzyplugh" back as
    // an entity) no longer save gibberish — we only trust entities that look
    // real (multi-word, or contain at least one in-corpus token).
    const knownTokenSet = new Set(rareGateTokens.filter((t) => {
      // any token NOT in the unknown set has df>=1
      return !rareTokens.includes(t) ? false : true;
    }));
    void knownTokenSet; // not currently used; placeholder for future use
    const trustedEntities = rawEntities.filter((e) => {
      const lc = e.toLowerCase();
      // Multi-word entity = trusted (AI rarely fabricates "Joe Rogan")
      if (e.includes(" ")) return true;
      // Single-token entity that exactly equals a query token = NOT trusted (echo)
      const tokens = lc.split(/[^a-z0-9]+/).filter(Boolean);
      if (tokens.length === 1 && rareGateTokens.includes(tokens[0])) return false;
      return true;
    });
    if (
      idfRpcOk &&
      !isTickerQ &&
      rareGateTokens.length > 0 &&
      unknownTokenCount === rareGateTokens.length &&
      trustedEntities.length === 0
    ) {
      return new Response(JSON.stringify({
        episodes: [],
        understanding,
        timing: { embed_ms: tEmb, rpc_ms: 0, total_ms: Date.now() - t0 },
        semantic: !!q_embedding,
        cache_hit: cacheHit,
        confidence_band: "low",
        rare_tokens: rareGateTokens,
        nonsense_gate: true,
        reason: "no_known_tokens",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // v11: Phrase MUST gate → token-AND. Previously we required the full phrase
    // as a contiguous substring ("react hooks" word-boundary), which killed
    // recall on conceptual queries (e.g. an episode about useEffect that
    // never literally writes "react hooks"). Now each phrase token is
    // individually required (AND semantics) — both "react" AND "hooks" must
    // appear somewhere in the episode. The contiguous phrase still gets a
    // separate +0.15 boost via phrase_terms (handled by the RPC).
    const phraseTokens = qNorm.split(/[^a-z0-9]+/).filter(
      (t) => t.length >= 3 && !RARE_GATE_STOPWORDS.has(t) && !/^\d+$/.test(t)
    );
    const phrasePool: string[] = [];
    if (!isTickerQ && phraseTokens.length >= 2 && phraseTokens.length <= 4) {
      // Push individual tokens (AND), not the joined phrase (contiguous).
      for (const t of phraseTokens) phrasePool.push(t);
    }

    // v8/v9: Entity resolution against entity_profiles + topic_hubs (trgm fuzzy).
    // Wrapped in 400ms timeout — was a major p50 latency contributor (>1s on cold cache).
    let resolvedEntities: Array<{ kind: string; display_name: string; slug: string; similarity: number }> = [];
    if (!isTickerQ && qNorm.length >= 3 && qNorm.length <= 60) {
      const resolved = await withTimeout(
        supa.rpc("resolve_query_entities", { p_q: q, p_max: 6, p_threshold: 0.45 }).then((r: any) => r.data),
        400, "resolve_query_entities",
      );
      if (Array.isArray(resolved)) resolvedEntities = resolved as any;
    }
    const resolvedNames = uniqueClean(resolvedEntities.map((r) => r.display_name), 4);

    const requiredTerms = uniqueClean([...requiredTermsBase, ...rareTokens, ...phrasePool], 8);
    const entityTerms = uniqueClean([...rawEntities, ...resolvedNames], 10);
    // Contiguous-phrase boost survives as score nudge (+0.15) even though
    // the MUST gate uses individual tokens (AND).
    const contiguousPhrase = (!isTickerQ && phraseTokens.length >= 2 && phraseTokens.length <= 4)
      ? [phraseTokens.join(" ")] : [];
    const phraseTerms = uniqueClean([...contiguousPhrase, ...resolvedNames], 6);
    const alphaLex = isTickerQ ? 0.8 : (rawEntities.length > 0 || resolvedNames.length > 0) ? 0.65 : 0.45;

    // For ticker queries, the bare symbol (e.g. "ASTS") rarely appears in
    // episode tsv. Rewrite the lexical q to use the resolved company name(s)
    // so the lex CTE can actually find matching episodes. Semantic side still
    // uses the original embedding.
    let lexQ = q;
    if (isTickerQ && marketSymbol) {
      const companies = uniqueClean([
        ...symbolAliases,
        ...(curated.expansions || []),
        ...rawEntities.filter((t) => t.toUpperCase() !== marketSymbol),
        marketSymbol,
      ], 8);
      if (companies.length) {
        // websearch_to_tsquery OR-s quoted phrases when wrapped in OR keyword.
        lexQ = companies.map(quoteWebSearchTerm).join(" OR ");
      }
    } else {
      // Non-ticker: OR the raw query with curated + AI synonyms so a lexical
      // hit on a synonym (e.g. "panthera onca" for "jaguar animal") still
      // counts. Falls back to original q if no synonyms exist.
      const synExpansions = uniqueClean([
        ...(curated.expansions || []),
        ...((understanding?.synonyms as string[]) || []),
        ...((understanding?.expanded_terms as string[]) || []),
      ], 6).filter((t) => t.toLowerCase() !== q.toLowerCase());
      if (synExpansions.length) {
        const parts = [quoteWebSearchTerm(q), ...synExpansions.map(quoteWebSearchTerm)];
        lexQ = parts.join(" OR ");
      }
    }

    let { data: rows, error } = await supa.rpc("search_episodes_hybrid", {
      q: lexQ,
      q_embedding: q_embedding ? `[${q_embedding.join(",")}]` : null,
      limit_n: Math.max(limit, 50),
      lang,
      required_terms: requiredTerms.length ? requiredTerms : null,
      entity_terms: entityTerms.length ? entityTerms : null,
      alpha_lex: alphaLex,
      phrase_terms: phraseTerms.length ? phraseTerms : null,
    });
    if (error) {
      console.error("rpc err", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let mustGateApplied = requiredTerms.length > 0;
    let mustGateRelaxed = false;
    let mustGateDropped = false;
    const strictRows = rows || [];
    const strictHitIds = new Set(strictRows.map((r: any) => r.episode_id));
    const strictIds = new Set(strictHitIds);
    const appendNew = (extra: any[] | null | undefined) => {
      if (!extra) return;
      for (const r of extra) {
        if (!strictIds.has(r.episode_id)) {
          strictRows.push(r);
          strictIds.add(r.episode_id);
        }
      }
    };

    // Pass 2 — drop phrase requirement, keep entity / rare-token gate.
    if (strictRows.length < 5 && mustGateApplied && phrasePool.length) {
      const noPhraseTerms = requiredTerms.filter((t) => !phrasePool.includes(t));
      if (noPhraseTerms.length !== requiredTerms.length) {
        const retry = await supa.rpc("search_episodes_hybrid", {
          q: lexQ,
          q_embedding: q_embedding ? `[${q_embedding.join(",")}]` : null,
          limit_n: Math.max(limit, 50),
          lang,
          required_terms: noPhraseTerms.length ? noPhraseTerms : null,
          entity_terms: entityTerms.length ? entityTerms : null,
          alpha_lex: alphaLex,
          phrase_terms: phraseTerms.length ? phraseTerms : null,
        });
        if (!retry.error) { appendNew(retry.data); mustGateRelaxed = true; }
      }
    }

    // Pass 3 — relaxed gate (multi-word entities only).
    if (strictRows.length < 5 && mustGateApplied) {
      const strictTerms = requiredTerms.filter((t) => t.includes(" ") && !phrasePool.includes(t));
      const relaxedTerms = strictTerms.length ? strictTerms : null;
      if ((relaxedTerms?.join("|") || "") !== requiredTerms.join("|")) {
        const retry = await supa.rpc("search_episodes_hybrid", {
          q: lexQ,
          q_embedding: q_embedding ? `[${q_embedding.join(",")}]` : null,
          limit_n: Math.max(limit, 50),
          lang,
          required_terms: relaxedTerms,
          entity_terms: entityTerms.length ? entityTerms : null,
          alpha_lex: alphaLex,
          phrase_terms: phraseTerms.length ? phraseTerms : null,
        });
        if (!retry.error) { appendNew(retry.data); mustGateRelaxed = true; }
      }
    }
    // Pass 4 — drop gate entirely, semantic-tilted.
    // Skip when a phrase MUST is present: bare semantic neighbors of "Cursor IDE"
    // (sermons / Chicago Bears) are exactly the hallucination class we're killing.
    if (strictRows.length < 5 && mustGateApplied && q_embedding && !isTickerQ && phrasePool.length === 0) {
      const retry2 = await supa.rpc("search_episodes_hybrid", {
        q: lexQ,
        q_embedding: `[${q_embedding.join(",")}]`,
        limit_n: Math.max(limit, 50),
        lang,
        required_terms: null,
        entity_terms: entityTerms.length ? entityTerms : null,
        alpha_lex: Math.min(alphaLex, 0.35),
        phrase_terms: phraseTerms.length ? phraseTerms : null,
      });
      if (!retry2.error) { appendNew(retry2.data); mustGateDropped = true; }
    }

    // Pass 4 — ENTITY FALLBACK PYRAMID. Generalized from the ticker sector
    // fallback. If a ticker/person/company query has no strict hits, re-embed
    // using "{Entity} {context terms}" and run a semantic-only RPC. Anchors
    // the vector search to the entity's actual industry/topics instead of
    // bare-symbol vector neighbors (e.g. "NBIS" → "Nobel cluster").
    let sectorFallback = false;
    let sectorHint: string | null = null;
    let fallbackKind: "ticker" | "person" | "company" | null = null;
    if (strictRows.length === 0) {
      let entityName: string | null = null;
      let contextTerms: string | null = null;

      if (isTickerQ && marketSymbol) {
        fallbackKind = "ticker";
        entityName = symbolAliases[0]
          || rawEntities.find((t) => t.toUpperCase() !== marketSymbol)
          || (curated.expansions || [])[0]
          || marketSymbol;
        contextTerms = MARKET_SYMBOL_SECTORS[marketSymbol.toLowerCase()] || null;
      } else if (understanding?.intent === "person" || understanding?.intent === "company") {
        const primaryEntity = rawEntities.find((t) => t.includes(" ")) || rawEntities[0];
        if (primaryEntity) {
          fallbackKind = understanding.intent as "person" | "company";
          entityName = primaryEntity;
          // Use AI-expanded terms (topics/industry) as the semantic anchor.
          const ctx = uniqueClean([
            ...((understanding.expanded_terms as string[]) || []),
            ...((understanding.synonyms as string[]) || []),
          ], 6).filter((t) => t.toLowerCase() !== primaryEntity.toLowerCase());
          if (ctx.length) contextTerms = ctx.join(" ");
        }
      }

      if (entityName && contextTerms) {
        const sectorQText = `${entityName} ${contextTerms}`.trim();
        const sectorEmb = await embed(sectorQText);
        if (sectorEmb) {
          const retry3 = await supa.rpc("search_episodes_hybrid", {
            q: entityName,
            q_embedding: `[${sectorEmb.join(",")}]`,
            limit_n: Math.max(limit, 30),
            lang,
            required_terms: null,
            entity_terms: null,
            alpha_lex: 0.15,
          });
          if (!retry3.error && retry3.data?.length) {
            appendNew(retry3.data);
            sectorFallback = true;
            sectorHint = contextTerms.split(/\s+/).slice(0, 6).join(" ");
          }
        }
      }
    }

    // v10: Known-item / navigational query — pin episodes from a podcast whose
    // title fuzzy-matches the query (e.g. "All-In", "Acquired", "BG2", "Founders
    // podcast"). Industry-standard query-classification step (Spotify/Apple).
    let podcastPinSlug: string | null = null;
    let podcastPinTitle: string | null = null;
    let podcastPinIds: string[] = [];
    if (!isTickerQ && qNorm.length >= 3 && qNorm.length <= 60) {
      // Strip podcast filler before matching ("acquired podcast" → "acquired").
      const cleanedQ = qNorm.replace(/\b(podcast|podcasts|show|shows|episode|episodes)\b/g, " ").replace(/\s+/g, " ").trim() || qNorm;
      const pmRes = await withTimeout(
        supa.rpc("match_podcast_by_name", { p_q: cleanedQ, p_max: 1, p_threshold: 0.45 }).then((r: any) => r.data),
        300, "match_podcast_by_name",
      );
      const top = Array.isArray(pmRes) && pmRes.length ? (pmRes[0] as any) : null;
      // Only pin if similarity is strong (≥0.6) — weak matches would pollute results.
      const sim = top && (typeof top.similarity === "number" ? top.similarity : (typeof top.sim === "number" ? top.sim : 0));
      if (top && sim >= 0.6) {
        podcastPinSlug = top.slug;
        podcastPinTitle = top.title;
        const { data: pinEps } = await supa
          .from("episodes")
          .select("id")
          .eq("podcast_id", top.podcast_id)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(8);
        if (pinEps?.length) podcastPinIds = pinEps.map((e: any) => e.id);
        // Inject into strictRows so they survive the rest of the pipeline.
        for (const id of podcastPinIds) {
          if (!strictIds.has(id)) {
            strictRows.unshift({ episode_id: id, lex_score: 1, sem_score: 1, hybrid_score: 1 } as any);
            strictIds.add(id);
            strictHitIds.add(id);
          }
        }
      }
    }

    // Confidence band: how much should we trust these results?
    // - high: solid strict hits, no fallback needed
    // - medium: relaxed gate or partial strict hits
    // - low: fallback kicked in / dropped gate / very few hits
    const strictCount = strictHitIds.size;
    let confidenceBand: "high" | "medium" | "low";
    if (sectorFallback || mustGateDropped) confidenceBand = "low";
    else if (mustGateApplied && strictCount >= 5 && !mustGateRelaxed) confidenceBand = "high";
    else if (strictCount >= 3) confidenceBand = "medium";
    else confidenceBand = "low";

    rows = strictRows;
    const tRpc = Date.now() - t0 - tEmb;

    const ids = (rows || []).map((r: any) => r.episode_id);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ episodes: [], understanding, timing: { embed_ms: tEmb, rpc_ms: tRpc }, semantic: !!q_embedding, cache_hit: cacheHit, must_gate: mustGateApplied, must_gate_relaxed: mustGateRelaxed, must_gate_dropped: mustGateDropped, confidence_band: "low", rare_tokens: rareTokens }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: eps, error: eErr } = await supa.from("episodes").select(EPISODE_SELECT).in("id", ids);
    if (eErr) {
      return new Response(JSON.stringify({ error: eErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const orderMap = new Map<string, number>();
    (rows as any[]).forEach((r, i) => orderMap.set(r.episode_id, i));
    let ordered = (eps || [])
      .filter((e: any) => {
        const p = e.podcasts;
        if (!p) return false;
        if (p.rss_status === "failed" || p.rss_status === "inactive") return false;
        return true;
      })
      .sort((a: any, b: any) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));

    let rerankResult: { ids: string[]; why: Record<string, string> } | null = null;
    let rerankCacheHit = false;
    if (wantRerank) {
      if (cachedRerank) {
        // Filter to ids actually present in this result-set (DB content may have shifted)
        const present = new Set(ordered.map((e: any) => e.id));
        const filteredIds = cachedRerank.ids.filter((id) => present.has(id));
        if (filteredIds.length >= 5) {
          rerankResult = { ids: filteredIds, why: cachedRerank.why };
          rerankCacheHit = true;
        }
      }
      if (!rerankResult) {
        rerankResult = await rerank(q, ordered);
        if (rerankResult && rerankResult.ids.length) {
          // Persist rerank cache (fire-and-forget)
          supa.from("search_query_cache").update({
            rerank: { ids: rerankResult.ids, why: rerankResult.why },
            rerank_updated_at: new Date().toISOString(),
          }).eq("q_norm", qNorm).then(() => {}, (e) => console.warn("rerank cache write", e));
        }
      }
    }
    const tRerank = Date.now() - t0 - tEmb - tRpc;

    if (rerankResult && rerankResult.ids.length) {
      const idx = new Map(rerankResult.ids.map((id, i) => [id, i]));
      ordered = ordered
        .map((e: any) => ({
          e,
          // Pin strict hits above non-strict regardless of rerank order.
          pin: strictHitIds.has(e.id) ? 0 : 1,
          r: idx.has(e.id) ? idx.get(e.id)! : 999 + (orderMap.get(e.id) ?? 0),
        }))
        .sort((a, b) => a.pin - b.pin || a.r - b.r)
        .map((x) => {
          const why = rerankResult!.why[x.e.id];
          return why ? { ...x.e, why_matched: why } : x.e;
        });
    }

    // Entity-pinning boost: episodes whose title or entity arrays contain at
    // least one AI-detected entity name (case-insensitive, word-boundary)
    // are pinned above episodes with zero entity matches. Strict-hit pin from
    // the rerank pass is preserved by adding entity match as a SECONDARY pin.
    // Fixes broad-name queries like "Cursor", "Stripe", "Perplexity" where
    // vector neighbors otherwise outrank actual mentions.
    const pinEntities = uniqueClean([
      ...((understanding?.entities as string[]) || []),
    ], 6).map((s) => s.toLowerCase()).filter((s) => s.length >= 3);
    if (pinEntities.length) {
      // v4: Strict brand match — entity present in the typed companies/tickers/people
      // arrays (NOT just title text). These are the highest-confidence matches.
      const strictBrandMatch = (e: any): boolean => {
        const arrays: string[] = [
          ...(Array.isArray(e.people) ? e.people : []),
          ...(Array.isArray(e.companies) ? e.companies : []),
          ...(Array.isArray(e.tickers) ? e.tickers : []),
        ].map((s) => String(s || "").toLowerCase());
        if (!arrays.length) return false;
        return pinEntities.some((ent) => arrays.some((v) => v === ent || v.includes(ent)));
      };
      const matchEntity = (e: any): boolean => {
        const hayParts = [
          e.title || "",
          (Array.isArray(e.people) ? e.people.join(" ") : ""),
          (Array.isArray(e.companies) ? e.companies.join(" ") : ""),
          (Array.isArray(e.tickers) ? e.tickers.join(" ") : ""),
          (Array.isArray(e.topics) ? e.topics.join(" ") : ""),
        ];
        const hay = hayParts.join(" ").toLowerCase();
        return pinEntities.some((ent) => {
          const re = new RegExp(`(?:^|[^a-z0-9])${ent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`);
          return re.test(hay);
        });
      };
      const annotated = ordered.map((e: any) => ({
        e,
        strict: strictBrandMatch(e),
        hit: matchEntity(e),
      }));
      const strictBrand = annotated.filter((x) => x.strict).map((x) => x.e);
      const looseHits = annotated.filter((x) => !x.strict && x.hit).map((x) => x.e);
      const misses = annotated.filter((x) => !x.strict && !x.hit).map((x) => x.e);
      if (strictBrand.length > 0 || looseHits.length > 0) {
        // v4: strict brand matches forced into the top of the list, then loose
        // text matches, then everything else. Caps strict-brand promotion at 6
        // so the top isn't monopolized when a single show has many matches.
        const strictHead = strictBrand.slice(0, 6);
        const strictTail = strictBrand.slice(6);
        ordered = [...strictHead, ...looseHits, ...strictTail, ...misses];
      }
    }

    // Podcast-level diversity (soft MMR): cap repeats per podcast in the ranked
    // list so a single show can't monopolize the top-10. Strict hits are
    // never demoted; excess episodes get pushed below the cap boundary.
    const diversify = (list: any[]): any[] => {
      if (list.length <= 5) return list;
      const caps: Array<{ until: number; max: number }> = [
        { until: 10, max: 2 },
        { until: 20, max: 3 },
      ];
      const counts = new Map<string, number>();
      const kept: any[] = [];
      const overflow: any[] = [];
      for (const e of list) {
        const pid = e.podcast_id || e.podcasts?.slug || "unknown";
        if (strictHitIds.has(e.id)) {
          kept.push(e);
          counts.set(pid, (counts.get(pid) || 0) + 1);
          continue;
        }
        const pos = kept.length;
        const cap = caps.find((c) => pos < c.until);
        const cur = counts.get(pid) || 0;
        if (cap && cur >= cap.max) { overflow.push(e); continue; }
        kept.push(e);
        counts.set(pid, cur + 1);
      }
      return [...kept, ...overflow];
    };
    ordered = diversify(ordered);

    // v10: Final podcast-name pin — episodes from the matched podcast bubble to top.
    if (podcastPinIds.length) {
      const pinSet = new Set(podcastPinIds);
      const pinned = ordered.filter((e: any) => pinSet.has(e.id));
      const rest = ordered.filter((e: any) => !pinSet.has(e.id));
      // Order pinned by published_at desc (we already requested in that order).
      pinned.sort((a: any, b: any) => podcastPinIds.indexOf(a.id) - podcastPinIds.indexOf(b.id));
      ordered = [...pinned, ...rest];
    }

    return new Response(
      JSON.stringify({
        episodes: ordered.slice(0, limit),
        understanding,
        curated_synonyms: { matched: curated.matched_terms, expansions: curated.expansions },
        semantic: !!q_embedding,
        reranked: !!rerankResult,
        rerank_cache_hit: rerankCacheHit,
        cache_hit: cacheHit,
        must_gate: mustGateApplied,
        must_gate_relaxed: mustGateRelaxed,
        must_gate_dropped: mustGateDropped,
        sector_fallback: sectorFallback,
        sector_hint: sectorHint,
        fallback_kind: fallbackKind,
        ticker_symbol: isTickerQ ? marketSymbol : null,
        confidence_band: confidenceBand,
        rare_tokens: rareTokens,
        spell_corrections: spellCorrections.length ? spellCorrections : null,
        alpha_lex: alphaLex,
        podcast_pin: podcastPinSlug ? { slug: podcastPinSlug, title: podcastPinTitle, count: podcastPinIds.length } : null,
        timing: { embed_ms: tEmb, rpc_ms: tRpc, rerank_ms: tRerank, total_ms: Date.now() - t0 },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("search-hybrid err", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
