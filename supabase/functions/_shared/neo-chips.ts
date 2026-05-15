// Aggregates "verified" disambiguation chips from real top results so every
// chip the user clicks is guaranteed to have hits.
// Used by search-refine.

export type ChipResult = {
  podcastTitle?: string;
  podcastSlug?: string;
  categoryPrimary?: string;
  people?: string[];
  companies?: string[];
  topics?: string[];
  publishedAt?: string | null;
};

export type Chip = {
  label: string;     // visible text
  query: string;     // refinement string to append to q
  count: number;     // hits in top-50
  kind: "entity" | "podcast";
  emoji?: string;
};

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "on", "in", "with",
  "podcast", "episode", "show", "ep", "interview",
]);

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

function tokenize(q: string): Set<string> {
  return new Set(norm(q).split(/\s+/).filter(Boolean));
}

export function aggregateChips(
  results: ChipResult[],
  q: string,
  opts: { maxChips?: number; minCount?: number } = {},
): Chip[] {
  const maxChips = opts.maxChips ?? 3;
  const minCount = opts.minCount ?? 3;
  const qTokens = tokenize(q);
  const total = results.length;
  if (total === 0) return [];

  // --- Entity tally (people + companies + topics combined, dedup by lowercase) ---
  type EntCount = { value: string; kind: "person" | "company" | "topic"; count: number };
  const entMap = new Map<string, EntCount>();
  const tallyEnt = (arr: string[] | undefined, kind: "person" | "company" | "topic") => {
    if (!Array.isArray(arr)) return;
    const seenInThisRow = new Set<string>();
    for (const raw of arr) {
      if (!raw || typeof raw !== "string") continue;
      const v = raw.trim();
      if (!v || v.length < 2 || v.length > 60) continue;
      const key = norm(v);
      if (!key || STOP.has(key) || seenInThisRow.has(key)) continue;
      // Skip entity if every word of it is already in the query
      const entTokens = key.split(/\s+/).filter(Boolean);
      if (entTokens.length && entTokens.every((t) => qTokens.has(t))) continue;
      seenInThisRow.add(key);
      const cur = entMap.get(key);
      if (cur) cur.count++;
      else entMap.set(key, { value: v, kind, count: 1 });
    }
  };
  for (const r of results) {
    // dedup across the row's people+companies+topics
    const seenInRow = new Set<string>();
    const tallyDedup = (arr: string[] | undefined, kind: "person" | "company" | "topic") => {
      if (!Array.isArray(arr)) return;
      for (const raw of arr) {
        if (!raw) continue;
        const v = raw.trim();
        if (!v || v.length < 2 || v.length > 60) continue;
        const key = norm(v);
        if (!key || STOP.has(key) || seenInRow.has(key)) continue;
        const entTokens = key.split(/\s+/).filter(Boolean);
        if (entTokens.length && entTokens.every((t) => qTokens.has(t))) continue;
        seenInRow.add(key);
        const cur = entMap.get(key);
        if (cur) cur.count++;
        else entMap.set(key, { value: v, kind, count: 1 });
      }
    };
    tallyDedup(r.people, "person");
    tallyDedup(r.companies, "company");
    tallyDedup(r.topics, "topic");
  }

  const entityChips: Chip[] = Array.from(entMap.values())
    .filter((e) => e.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((e) => ({
      label: e.value,
      query: e.value,
      count: e.count,
      kind: "entity" as const,
      emoji: e.kind === "person" ? "👤" : e.kind === "company" ? "🏢" : "🏷",
    }));

  // --- Podcast tally ---
  const podMap = new Map<string, { title: string; count: number }>();
  for (const r of results) {
    if (!r.podcastTitle) continue;
    const key = norm(r.podcastTitle);
    if (!key) continue;
    const cur = podMap.get(key);
    if (cur) cur.count++;
    else podMap.set(key, { title: r.podcastTitle, count: 1 });
  }
  const podSorted = Array.from(podMap.values()).sort((a, b) => b.count - a.count);
  const topPodShare = podSorted.length ? podSorted[0].count / total : 0;
  let podcastChips: Chip[] = [];
  // If one podcast already dominates the result list, podcast chips are noise.
  if (topPodShare < 0.4 && podSorted.length >= 2) {
    podcastChips = podSorted
      .filter((p) => p.count >= minCount)
      .slice(0, 3)
      .map((p) => ({
        label: p.title,
        query: p.title,
        count: p.count,
        kind: "podcast" as const,
        emoji: "🎙",
      }));
  }

  // Merge: prefer entity chips first, then top podcast chip.
  const out: Chip[] = [];
  for (const c of entityChips) {
    if (out.length >= maxChips) break;
    out.push(c);
  }
  for (const c of podcastChips) {
    if (out.length >= maxChips) break;
    // Avoid duplicate label
    if (out.some((x) => norm(x.label) === norm(c.label))) continue;
    out.push(c);
  }
  return out;
}

// Decides whether Neo should surface at all. Returns the trigger mode or "off".
export function decideMode(opts: {
  q: string;
  totalHits: number;
  strictHitCount: number;
  topResults: ChipResult[];
  intent?: string;
}): "off" | "ambiguity" | "zero_hit" {
  const q = (opts.q || "").trim();
  if (!q) return "off";
  if (q.startsWith('"') && q.endsWith('"')) return "off";
  const wordCount = q.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 4) return "off";

  // Zero-hit: lexical search returned nothing useful but we have any vector fallback
  if (opts.strictHitCount === 0 && opts.topResults.length > 0) return "zero_hit";

  if (opts.totalHits < 10) return "off";

  // Wide ambiguity: short query + many hits + diverse categories
  const cats = new Set(
    opts.topResults.slice(0, 10).map((r) => (r.categoryPrimary || "").toLowerCase()).filter(Boolean),
  );
  const isTickerLike = /^[A-Z]{2,5}(\.[A-Z])?$/.test(q) || opts.intent === "ticker";
  if (wordCount <= 2 && opts.totalHits >= 200 && cats.size >= 3) return "ambiguity";
  if (isTickerLike && opts.totalHits >= 50) return "ambiguity";

  return "off";
}
