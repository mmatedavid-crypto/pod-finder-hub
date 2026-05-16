// Entity extraction prompt + tool schema for Gemini.
// Keeps arrays small + canonical to avoid splintering the entity index.

export const ENTITY_SYSTEM_PROMPT = `You are an entity extraction engine for podcast episodes.
You read English podcast episode metadata and extract people, companies, stock tickers and topics actually discussed.

Be CONSERVATIVE. Only extract entities that are clearly relevant to THIS episode, not background mentions or sponsor reads.

# People — assign one of four roles to each person

- "host":      A regular host of THIS show. Skip unless clearly identifiable as the show's host.
- "guest":     A person who is PRESENT in the episode (interviewed, in conversation). They must be ALIVE and actually speaking/appearing. Do NOT mark deceased, historical, or absent public figures as guests.
- "subject":   The episode is ABOUT this person but they are NOT present. Use this for deceased people (e.g. Jeffrey Epstein, JFK), historical figures, news/crime subjects, and public figures who are being analyzed/discussed but are not in the room.
- "mentioned": Brought up in passing but not the focus.

For each person also set:
- present_in_episode: true ONLY if you are confident the person physically/vocally appears.
- is_deceased_or_historical: true for dead people or historical figures (pre-1950 figures, world-historical names).
- confidence: 0.0–1.0. Use <0.5 when uncertain (it will be downgraded to "mentioned").

# Examples (people)
- Title "The Epstein Files: What Really Happened" → Jeffrey Epstein: role=subject, present=false, deceased=true, confidence=0.95
- Title "Sam Altman on the future of AI" → Sam Altman: role=guest, present=true, deceased=false, confidence=0.9
- Title "Remembering Kobe Bryant" → Kobe Bryant: role=subject, present=false, deceased=true
- Title "Why Putin can't win" → Vladimir Putin: role=subject, present=false (public figure being analyzed, not present)
- Title "Tucker interviews Elon Musk" → Tucker Carlson: role=host (or guest if Tucker isn't the show host), Elon Musk: role=guest, present=true
- Title "The rise and fall of FTX" mentioning SBF → Sam Bankman-Fried: role=subject
- Title "What I learned from Steve Jobs" → Steve Jobs: role=subject, deceased=true

# Other rules
- People: full real names. Use canonical English spelling. Skip generic roles ("the host", "the CEO").
- Companies: real organizations discussed. Common short name ("Tesla", not "Tesla, Inc."). Skip generics ("the company").
- Tickers: stock ticker symbols mentioned (e.g. "TSLA"). Uppercase, no exchange prefix. Only if explicitly mentioned.
- Topics: 3–7 concrete topic phrases (e.g. "AI regulation", "GLP-1 drugs"). Lowercase, no trailing punctuation. NOT broad genres.

# Limits
- people <= 8, companies <= 8, tickers <= 6, topics <= 7. Quality over quantity. Empty arrays are fine.

Output via the extract_entities tool only.`;

export const ENTITY_TOOL = {
  type: "function" as const,
  function: {
    name: "extract_entities",
    description: "Extract role-tagged people, companies, tickers and topics actually discussed in the podcast episode.",
    parameters: {
      type: "object",
      properties: {
        people: {
          type: "array",
          description: "Up to 8 people with role tags.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Canonical full name." },
              role: { type: "string", enum: ["host", "guest", "subject", "mentioned"] },
              present_in_episode: { type: "boolean", description: "True ONLY if you are confident the person physically/vocally appears." },
              is_deceased_or_historical: { type: "boolean", description: "True for deceased people and historical figures." },
              confidence: { type: "number", description: "0.0–1.0 confidence in the role assignment." },
            },
            required: ["name", "role", "present_in_episode", "is_deceased_or_historical", "confidence"],
          },
        },
        companies: { type: "array", items: { type: "string" }, description: "Common short names of organizations discussed (max 8)." },
        tickers: { type: "array", items: { type: "string" }, description: "Uppercase stock tickers explicitly mentioned (max 6)." },
        topics: { type: "array", items: { type: "string" }, description: "3-7 concrete topic phrases, lowercase." },
      },
      required: ["people", "companies", "tickers", "topics"],
    },
  },
};

export function entityUserPrompt(ep: { title?: string; display_title?: string; description?: string | null; summary?: string | null; ai_summary?: string | null }, podName: string): string {
  const title = ep.display_title || ep.title || "";
  const body =
    (ep.ai_summary && ep.ai_summary.trim()) ||
    (ep.summary && ep.summary.trim()) ||
    (ep.description && ep.description.trim()) ||
    "";
  const trimmed = body.length > 3500 ? body.slice(0, 3500) + "…" : body;
  return `Podcast: ${podName}
Episode title: ${title}

Episode notes:
${trimmed}

Call extract_entities. For each person, assign the correct role (host/guest/subject/mentioned) and set present_in_episode and is_deceased_or_historical accurately. Remember: dead or historical figures are SUBJECTS, never guests.`;
}

// ============================================================================
// Post-LLM deterministic guard: title patterns + confidence floor + caps.
// Returns the sanitized people_roles array and a flat names array.
// ============================================================================

export type PersonRole = "host" | "guest" | "subject" | "mentioned";
export type PersonEntry = {
  name: string;
  role: PersonRole;
  present_in_episode: boolean;
  is_deceased_or_historical: boolean;
  confidence: number;
};

// Title patterns indicating the named person is the SUBJECT (not present).
const SUBJECT_PATTERNS: RegExp[] = [
  /\b(?:remembering|tribute to|the legacy of|the death of|the murder of|who killed|inside the mind of)\b/i,
  /\bthe\s+\S+\s+(?:files|case|story|scandal|tapes|conspiracy)\b/i,
  /\b(?:rise and fall of|the fall of|what happened to|what really happened)\b/i,
  /\b(?:exposed|unmasked|debunked|explained)\b/i,
];

// Title patterns indicating the named person is a GUEST (present).
const GUEST_PATTERNS: RegExp[] = [
  /\b(?:with|w\/|feat\.?|featuring|ft\.?)\s+[A-Z]/,
  /\b[A-Z][a-z]+\s+(?:joins|sits down|talks to|interview|interviewed by)\b/i,
  /\binterview\s+with\b/i,
];

// Escape a name for regex.
function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Has a possessive pattern for this name? e.g. "Epstein's death"
function hasPossessive(title: string, name: string): boolean {
  const last = name.split(/\s+/).pop() || name;
  const re = new RegExp(`\\b${escapeReg(last)}['’]s\\b`, "i");
  return re.test(title);
}

// Has "with NAME" / "feat NAME" / "NAME joins"?
function hasGuestSignalForName(title: string, name: string): boolean {
  const last = name.split(/\s+/).pop() || name;
  const re = new RegExp(
    `\\b(?:with|w\\/|feat\\.?|featuring|ft\\.?)\\s+(?:[A-Z][a-z]+\\s+)?${escapeReg(last)}\\b|\\b${escapeReg(name)}\\s+(?:joins|sits down|talks to)\\b|\\binterview\\s+with\\s+${escapeReg(name)}\\b`,
    "i",
  );
  return re.test(title);
}

export function postProcessPeople(
  raw: unknown,
  ctx: { title: string; podcast_title?: string; hosts?: string[] },
): { people_roles: PersonEntry[]; people: string[] } {
  if (!Array.isArray(raw)) return { people_roles: [], people: [] };
  const title = ctx.title || "";
  const knownHosts = new Set((ctx.hosts || []).map((h) => h.toLowerCase().trim()));

  const seen = new Set<string>();
  const cleaned: PersonEntry[] = [];

  const subjectTitleHit = SUBJECT_PATTERNS.some((re) => re.test(title));
  const guestTitleHit = GUEST_PATTERNS.some((re) => re.test(title));

  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as any;
    const name = String(rec.name || "").replace(/\s+/g, " ").trim();
    if (!name || name.length > 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    let role: PersonRole = ["host", "guest", "subject", "mentioned"].includes(rec.role) ? rec.role : "mentioned";
    let present = Boolean(rec.present_in_episode);
    const deceased = Boolean(rec.is_deceased_or_historical);
    const confidence = Math.max(0, Math.min(1, Number(rec.confidence) || 0));

    // Layer A: deceased / historical can never be host or guest
    if (deceased && (role === "host" || role === "guest")) {
      role = "subject";
      present = false;
    }

    // Layer B: known host of this podcast overrides
    if (knownHosts.has(key) && !deceased) {
      role = "host";
      present = true;
    }

    // Layer C: title-pattern overrides
    // - If title screams SUBJECT (possessive or "X's death"/"the X files" etc.) and LLM said guest → subject
    if (role === "guest" && !hasGuestSignalForName(title, name) && (subjectTitleHit || hasPossessive(title, name))) {
      role = "subject";
      present = false;
    }
    // - If title clearly signals guest ("with NAME", "NAME joins") and LLM said subject → guest (unless deceased)
    if (role === "subject" && !deceased && hasGuestSignalForName(title, name) && guestTitleHit) {
      role = "guest";
      present = true;
    }

    // Layer D: confidence floor — demote to mentioned
    if (confidence < 0.5 && role !== "host") {
      role = "mentioned";
      present = false;
    }

    cleaned.push({ name, role, present_in_episode: present, is_deceased_or_historical: deceased, confidence });
  }

  // Layer E: caps — max 1 host, max 2 guests, total 8
  // Sort by role priority then confidence; trim extras to "mentioned".
  const rolePriority: Record<PersonRole, number> = { host: 4, guest: 3, subject: 2, mentioned: 1 };
  cleaned.sort((a, b) => rolePriority[b.role] - rolePriority[a.role] || b.confidence - a.confidence);

  let hostsKept = 0;
  let guestsKept = 0;
  for (const p of cleaned) {
    if (p.role === "host") {
      if (hostsKept >= 1) { p.role = "mentioned"; p.present_in_episode = false; }
      else hostsKept++;
    } else if (p.role === "guest") {
      if (guestsKept >= 2) { p.role = "mentioned"; p.present_in_episode = false; }
      else guestsKept++;
    }
  }

  const people_roles = cleaned.slice(0, 8);
  const people = people_roles.map((p) => p.name);
  return { people_roles, people };
}
