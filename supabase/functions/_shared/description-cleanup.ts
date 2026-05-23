// Conservative rules-based description cleanup for podcast/episode descriptions.
// Strips: HTML, sponsor blocks, social/subscribe CTAs, link lists, timestamp
// lists, email/phone CTAs, self-promo footers. Reverts to raw if cleanup is
// too aggressive (<30% retained or <50 chars left).
//
// Returns { display, changed, removedPct, needsAi, reasons } so the runner can
// decide whether to escalate to AI fallback (S/A tier only).

// Inline minimal stripHtml (edge functions can't import from src).

function _stripHtml(s: string): string {
  if (!s) return "";
  let t = String(s);
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n");
  t = t.replace(/<[^>]+>/g, " ");
  // entities
  t = t.replace(/&nbsp;/g, " ")
       .replace(/&amp;/g, "&")
       .replace(/&lt;/g, "<")
       .replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'")
       .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
         try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; }
       })
       .replace(/&#(\d+);/g, (_, d) => {
         try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ""; }
       });
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return t;
}

export interface CleanupResult {
  display: string;
  changed: boolean;
  removedPct: number;
  needsAi: boolean;
  reasons: string[];
  status: "rules_ok" | "skipped" | "reverted";
}

const MIN_RETAIN_RATIO = 0.30;
const MIN_LEN = 50;

// Pattern groups — each returns the text with that pattern removed.
const PATTERNS: Array<{ name: string; apply: (t: string) => string }> = [
  // 1. Sponsor blocks — until next blank line OR end
  {
    name: "sponsor_block",
    apply: (t) => t.replace(
      /(^|\n)[\t ]*(?:sponsors?|today'?s sponsors?|this episode is brought to you by|this episode is sponsored by|brought to you by|sponsored by|presenting sponsor)[\s\S]*?(?=\n\s*\n|$)/gi,
      "\n",
    ),
  },
  // 2. Promo / discount code lines
  {
    name: "promo_code",
    apply: (t) => t.replace(
      /(^|\n)[^\n]*?\b(?:promo code|use code|discount code|coupon code|enter code|code\s*:)\s+[A-Z0-9]{2,}[^\n]*/gi,
      "\n",
    ),
  },
  // 3. Subscribe / newsletter CTAs
  {
    name: "subscribe_cta",
    apply: (t) => t.replace(
      /(^|\n)[^\n]*\b(?:subscribe (?:to (?:our|the) )?(?:newsletter|podcast|channel|show)|sign up for (?:our|the) newsletter|join (?:our|the) (?:newsletter|mailing list|community)|never miss an episode)[^\n]*/gi,
      "\n",
    ),
  },
  // 4. Follow us on social
  {
    name: "social_follow",
    apply: (t) => t.replace(
      /(^|\n)[^\n]*\b(?:follow (?:us|me|the show)|find us on|connect with (?:us|me)|join us on)\b[^\n]*(?:twitter|instagram|tiktok|youtube|facebook|linkedin|patreon|discord|substack|threads|bluesky|mastodon|x\.com)[^\n]*/gi,
      "\n",
    ),
  },
  // 5. Patreon / Substack / Discord pitches
  {
    name: "patreon",
    apply: (t) => t.replace(
      /(^|\n)[^\n]*\b(?:patreon|substack|ko-?fi|buymeacoffee|memberful|supercast)\b[^\n]*/gi,
      "\n",
    ),
  },
  // 6. Section headers + their body until blank line
  {
    name: "links_section",
    apply: (t) => t.replace(
      /(^|\n)[\t ]*(?:links?(?: mentioned)?|show notes?|resources?|references?|mentioned in this episode|episode links?|find (?:us|me|the show) (?:here|at)|connect with (?:us|me)|where to find (?:us|me))[\t ]*:?[\t ]*\n[\s\S]*?(?=\n\s*\n|$)/gi,
      "\n",
    ),
  },
  // 7. Timestamps / chapters lists  (a run of lines starting with mm:ss or [mm:ss])
  {
    name: "timestamps",
    apply: (t) => t.replace(
      /(^|\n)[\t ]*(?:timestamps?|chapters?|in this episode)[\t ]*:?[\t ]*\n(?:[\t ]*[\[\(]?\d{1,2}:\d{2}(?::\d{2})?[\]\)]?[^\n]*\n?){2,}/gi,
      "\n",
    ),
  },
  {
    name: "timestamps_inline",
    apply: (t) => t.replace(
      /(^|\n)(?:[\t ]*[\[\(]?\d{1,2}:\d{2}(?::\d{2})?[\]\)]?[^\n]{0,120}\n){3,}/g,
      "\n",
    ),
  },
  // 8. Standalone URL lines
  {
    name: "url_line",
    apply: (t) => t.replace(
      /(^|\n)[\t ]*(?:https?:\/\/|www\.)\S+[\t ]*(?=\n|$)/gi,
      "\n",
    ),
  },
  // 9. Email CTA lines
  {
    name: "email_cta",
    apply: (t) => t.replace(
      /(^|\n)[^\n]*\b(?:email (?:us|me)|contact (?:us|me)|reach (?:us|out) at|questions\?|feedback\?)[^\n]*?[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\n]*/gi,
      "\n",
    ),
  },
  // 10. "@handle" social handle lines (when line is mostly handles)
  {
    name: "handle_line",
    apply: (t) => t.replace(
      /(^|\n)[\t ]*(?:@\w+[\s,•|]*){2,}[\t ]*(?=\n|$)/gi,
      "\n",
    ),
  },
  // 11. Hashtag soup at end of line
  {
    name: "hashtag_soup",
    apply: (t) => t.replace(
      /(^|\n)[\t ]*(?:#\w+[\s,]*){3,}[\t ]*(?=\n|$)/gi,
      "\n",
    ),
  },
  // 12. "Hosted on Acast" / Megaphone / etc. footer
  {
    name: "host_footer",
    apply: (t) => t.replace(
      /(^|\n)[^\n]*\b(?:hosted on acast|see acast\.com\/privacy|advertising inquiries|advertisinginquiries@|learn more about your ad choices|visit megaphone\.fm)[^\n]*/gi,
      "\n",
    ),
  },
];

const NEEDS_AI_PATTERNS = [
  /https?:\/\//i,
  /\bpatreon\b/i,
  /\bsponsor/i,
  /\bsubscribe\b/i,
  /\buse code\b/i,
  /\bpromo code\b/i,
  /@\w+\s*@\w+/,  // multiple handles
];

export function cleanDescription(rawHtml: string | null | undefined): CleanupResult {
  if (!rawHtml) {
    return { display: "", changed: false, removedPct: 0, needsAi: false, reasons: ["empty"], status: "skipped" };
  }
  const original = _stripHtml(String(rawHtml));
  if (original.length < MIN_LEN) {
    return { display: original, changed: false, removedPct: 0, needsAi: false, reasons: ["too_short"], status: "skipped" };
  }

  let t = original;
  const reasons: string[] = [];
  for (const p of PATTERNS) {
    const before = t.length;
    t = p.apply(t);
    if (t.length < before) reasons.push(p.name);
  }

  // Final whitespace cleanup
  t = t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();

  const retained = t.length / Math.max(1, original.length);
  const removedPct = Math.round((1 - retained) * 100);

  // Safety guard — too aggressive → revert
  if (t.length < MIN_LEN || retained < MIN_RETAIN_RATIO) {
    return {
      display: original,
      changed: false,
      removedPct,
      needsAi: NEEDS_AI_PATTERNS.some((re) => re.test(original)),
      reasons: ["reverted_too_aggressive", ...reasons],
      status: "reverted",
    };
  }

  const needsAi = NEEDS_AI_PATTERNS.some((re) => re.test(t));
  const changed = t !== original;

  return {
    display: t,
    changed,
    removedPct,
    needsAi,
    reasons,
    status: "rules_ok",
  };
}
