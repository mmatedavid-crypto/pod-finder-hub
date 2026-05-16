import { slugify } from "./slug";

export type EntityKind = "topic" | "person" | "company" | "ticker" | "ingredient";

export const ENTITY_COLUMN: Record<EntityKind, "topics" | "people" | "companies" | "tickers" | "ingredients"> = {
  topic: "topics",
  person: "people",
  company: "companies",
  ticker: "tickers",
  ingredient: "ingredients",
};

export const ENTITY_LABEL: Record<EntityKind, string> = {
  topic: "Topic",
  person: "Person",
  company: "Company",
  ticker: "Ticker",
  ingredient: "Ingredient",
};

export function entitySlug(kind: EntityKind, value: string): string {
  if (kind === "ticker") return value.replace(/[^a-zA-Z0-9.]+/g, "").toUpperCase();
  return slugify(value);
}

export function entityHref(kind: EntityKind, value: string): string {
  return `/${kind === "ticker" ? "ticker" : kind}/${encodeURIComponent(entitySlug(kind, value))}`;
}

// Match against a candidate value (case-insensitive slug for most kinds; symbol for ticker)
export function matchesEntitySlug(kind: EntityKind, value: string, slug: string): boolean {
  if (!value) return false;
  if (kind === "ticker") return value.replace(/[^a-zA-Z0-9.]+/g, "").toUpperCase() === slug.toUpperCase();
  return slugify(value) === slug.toLowerCase();
}

// Match strength tiers for entity pages.
// 3 = Strong  (in title — clear focus of the episode, e.g. an interview)
// 2 = Medium  (in ai_summary opening OR top of the entity array — meaningfully discussed)
// 1 = Weak    (tagged but only briefly mentioned)
export type EntityMatchStrength = 1 | 2 | 3;

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function classifyEntityMatch(
  ep: {
    title?: string | null;
    display_title?: string | null;
    ai_summary?: string | null;
    summary?: string | null;
    description?: string | null;
  } & Record<string, any>,
  kind: EntityKind,
  canonicalValue: string,
  aliases: string[] = [],
): EntityMatchStrength {
  const col = ENTITY_COLUMN[kind];
  const arr: string[] = Array.isArray(ep[col]) ? ep[col] : [];

  // Build alias set (normalized) — canonical + provided aliases + tag-matching values.
  const aliasSet = new Set<string>();
  const push = (v: string) => { const n = norm(v); if (n.length >= 2) aliasSet.add(n); };
  push(canonicalValue);
  aliases.forEach(push);
  arr.forEach((v) => { if (matchesEntitySlug(kind, v, canonicalValue)) push(v); });

  // For tickers: cashtag/uppercase match in title text.
  const aliasesArr = Array.from(aliasSet);
  if (aliasesArr.length === 0) return 1;

  const hay = (s?: string | null) => norm(s || "");
  const inText = (text: string) => {
    if (!text) return false;
    return aliasesArr.some((a) => {
      // Word-boundary-ish: avoid "ai" matching "said". Use simple boundary by spaces/punct.
      const re = new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
      return re.test(text);
    });
  };

  // STRONG: appears in title or display_title
  if (inText(hay(ep.display_title)) || inText(hay(ep.title))) return 3;

  // MEDIUM: in opening of ai_summary (first ~280 chars / first 2 sentences)
  const summary = hay(ep.ai_summary) || hay(ep.summary) || hay(ep.description);
  if (summary) {
    const opening = summary.slice(0, 280);
    if (inText(opening)) return 2;
  }

  // MEDIUM: among first 3 of the entity array
  const topSlice = arr.slice(0, 3);
  if (topSlice.some((v) => matchesEntitySlug(kind, v, canonicalValue) || aliasSet.has(norm(v)))) {
    return 2;
  }

  return 1;
}

