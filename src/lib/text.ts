// Strip raw HTML and normalise whitespace for any RSS-derived public text.

// Common named HTML entities (safe text-only decoding, no markup injection).
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D",
  sbquo: "\u201A", bdquo: "\u201E", lsaquo: "\u2039", rsaquo: "\u203A",
  laquo: "\u00AB", raquo: "\u00BB",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", bull: "\u2022",
  middot: "\u00B7", trade: "\u2122", copy: "\u00A9", reg: "\u00AE",
  deg: "\u00B0", plusmn: "\u00B1", times: "\u00D7", divide: "\u00F7",
  euro: "\u20AC", pound: "\u00A3", yen: "\u00A5", cent: "\u00A2",
  iexcl: "\u00A1", iquest: "\u00BF",
  Auml: "\u00C4", auml: "\u00E4", Ouml: "\u00D6", ouml: "\u00F6",
  Uuml: "\u00DC", uuml: "\u00FC", szlig: "\u00DF",
  aacute: "\u00E1", eacute: "\u00E9", iacute: "\u00ED", oacute: "\u00F3",
  uacute: "\u00FA", Aacute: "\u00C1", Eacute: "\u00C9", Iacute: "\u00CD",
  Oacute: "\u00D3", Uacute: "\u00DA",
  ntilde: "\u00F1", Ntilde: "\u00D1",
};

export function decodeEntities(s: string): string {
  if (!s || s.indexOf("&") === -1) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? safeFromCodePoint(cp) : _m;
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? safeFromCodePoint(cp) : _m;
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m,
    );
}

function safeFromCodePoint(cp: number): string {
  try {
    if (cp <= 0 || cp > 0x10ffff) return "";
    return String.fromCodePoint(cp);
  } catch { return ""; }
}

export function stripHtml(s?: string | null): string {
  if (!s) return "";
  let t = String(s);
  // remove script/style blocks
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  // line breaks
  t = t.replace(/<br\s*\/?>(?=)/gi, "\n").replace(/<\/p>/gi, "\n\n");
  // remove remaining tags (no HTML reinjected — plain text output)
  t = t.replace(/<[^>]+>/g, " ");
  // decode entities (named + numeric)
  t = decodeEntities(t);
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return t;
}

export function snippet(s?: string | null, max = 220, around?: string[]): string {
  const clean = stripHtml(s);
  if (!clean) return "";
  if (!around || !around.length) return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
  const lower = clean.toLowerCase();
  let bestIdx = -1;
  for (const term of around) {
    const i = lower.indexOf(term.toLowerCase());
    if (i >= 0 && (bestIdx < 0 || i < bestIdx)) bestIdx = i;
  }
  if (bestIdx < 0) return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
  const start = Math.max(0, bestIdx - Math.floor(max / 3));
  const end = Math.min(clean.length, start + max);
  const out = (start > 0 ? "…" : "") + clean.slice(start, end).trim() + (end < clean.length ? "…" : "");
  return out;
}

// Returns React-friendly array of strings/marks. Simple, case-insensitive, longest-first.
export function highlightParts(text: string, terms: string[]): Array<{ s: string; hit: boolean }> {
  if (!text) return [];
  const uniq = Array.from(new Set(terms.filter(Boolean).map((t) => t.trim()).filter((t) => t.length >= 2)))
    .sort((a, b) => b.length - a.length);
  if (!uniq.length) return [{ s: text, hit: false }];
  const escaped = uniq.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const out: Array<{ s: string; hit: boolean }> = [];
  let last = 0;
  text.replace(re, (m, _g, idx: number) => {
    if (idx > last) out.push({ s: text.slice(last, idx), hit: false });
    out.push({ s: m, hit: true });
    last = idx + m.length;
    return m;
  });
  if (last < text.length) out.push({ s: text.slice(last), hit: false });
  return out;
}
