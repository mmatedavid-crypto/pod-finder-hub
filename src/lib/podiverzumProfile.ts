/**
 * Podiverzum Profile — visual "horoscope" generator (English).
 * Deterministic on input: same swipes → same visuals.
 *
 * Layers: Aura (color palette), Element (Fire/Water/Earth/Air),
 * Constellation (deterministic SVG), Verdict (composed copy), PDV Code.
 */

/* ----- Mood metadata ----- */
type MoodMeta = {
  hsl: [number, number, number];
  energy: number; // -1..1
  warmth: number; // -1..1
  element: "fire" | "water" | "earth" | "air";
};

const MOOD: Record<string, MoodMeta> = {
  // calm / introspective → water
  contemplative: { hsl: [220, 55, 55], energy: -0.7, warmth: -0.2, element: "water" },
  deep:          { hsl: [255, 60, 40], energy: -0.4, warmth: -0.2, element: "water" },
  dark:          { hsl: [260, 50, 30], energy: -0.2, warmth: -0.6, element: "water" },
  // energetic → fire
  energetic:     { hsl: [12,  90, 58], energy:  0.9, warmth:  0.8, element: "fire" },
  exciting:      { hsl: [355, 80, 55], energy:  0.8, warmth:  0.6, element: "fire" },
  tense:         { hsl: [10,  70, 45], energy:  0.6, warmth: -0.2, element: "fire" },
  // playful / curious → air
  funny:         { hsl: [45,  90, 60], energy:  0.7, warmth:  0.8, element: "air"  },
  humor:         { hsl: [42,  88, 62], energy:  0.6, warmth:  0.7, element: "air"  },
  playful:       { hsl: [310, 75, 65], energy:  0.7, warmth:  0.5, element: "air"  },
  ironic:        { hsl: [285, 65, 55], energy:  0.4, warmth:  0.1, element: "air"  },
  curious:       { hsl: [165, 65, 55], energy:  0.4, warmth:  0.3, element: "air"  },
  exploratory:   { hsl: [150, 60, 55], energy:  0.5, warmth:  0.3, element: "air"  },
  // grounded / analytical → earth
  analytical:    { hsl: [200, 60, 45], energy:  0.1, warmth: -0.3, element: "earth" },
  critical:      { hsl: [355, 70, 50], energy:  0.3, warmth: -0.4, element: "earth" },
  objective:     { hsl: [195, 25, 55], energy:  0.0, warmth: -0.5, element: "earth" },
  // warm / human → earth / air
  honest:        { hsl: [15,  70, 60], energy:  0.1, warmth:  0.8, element: "earth" },
  personal:      { hsl: [340, 60, 65], energy:  0.0, warmth:  0.7, element: "earth" },
  inspiring:     { hsl: [50,  90, 60], energy:  0.7, warmth:  0.6, element: "air"   },
  warm:          { hsl: [25,  75, 60], energy:  0.2, warmth:  0.8, element: "earth" },
};

/* ----- Aura ----- */
export type AuraPalette = {
  colors: string[];
  primary: string;
  essence: string;
};

function blendHsl(entries: Array<{ hsl: [number, number, number]; w: number }>): [number, number, number] {
  let sx = 0, sy = 0, ss = 0, sl = 0, sw = 0;
  for (const e of entries) {
    const [h, s, l] = e.hsl;
    const rad = (h * Math.PI) / 180;
    sx += Math.cos(rad) * e.w;
    sy += Math.sin(rad) * e.w;
    ss += s * e.w; sl += l * e.w; sw += e.w;
  }
  if (sw === 0) return [220, 55, 55];
  let hue = (Math.atan2(sy / sw, sx / sw) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return [Math.round(hue), Math.round(ss / sw), Math.round(sl / sw)];
}

const FALLBACK_PALETTE: Array<[number, number, number]> = [
  [220, 55, 55], [285, 60, 55], [25, 75, 60], [165, 55, 50],
];

const ESSENCE: Record<string, string> = {
  contemplative: "midnight ocean",
  deep: "indigo well",
  dark: "stormy night",
  energetic: "neon skyline",
  exciting: "fireworks at midnight",
  tense: "tight wire",
  funny: "sunday picnic",
  humor: "bright kitchen",
  playful: "pink sunset",
  ironic: "violet smoke",
  curious: "emerald forest",
  exploratory: "new map unfolding",
  analytical: "clean workshop",
  critical: "amber glass",
  objective: "silver instrument",
  honest: "warm kitchen light",
  personal: "old photograph",
  inspiring: "golden dawn",
  warm: "afternoon sun",
};

export function buildAura(moodTagsWeighted: Record<string, number>): AuraPalette {
  const matched = Object.entries(moodTagsWeighted)
    .map(([t, w]) => ({ tag: t.toLowerCase(), w, meta: MOOD[t.toLowerCase()] }))
    .filter((x) => x.meta && x.w > 0);

  if (matched.length === 0) {
    const colors = FALLBACK_PALETTE.map(([h, s, l]) => `hsl(${h} ${s}% ${l}%)`);
    return { colors, primary: colors[0], essence: "swirling mist with sudden light" };
  }

  matched.sort((a, b) => b.w - a.w);

  const totalW = matched.reduce((s, x) => s + x.w, 0);
  let cum = 0;
  const primaryPool: typeof matched = [];
  for (const m of matched) {
    primaryPool.push(m);
    cum += m.w;
    if (cum / totalW >= 0.5) break;
  }
  const primary = blendHsl(primaryPool.map((m) => ({ hsl: m.meta.hsl, w: m.w })));

  const palette: [number, number, number][] = [primary];
  for (const m of matched) {
    if (palette.length >= 4) break;
    const tooClose = palette.some((p) => Math.abs(p[0] - m.meta.hsl[0]) < 18);
    if (!tooClose) palette.push(m.meta.hsl);
  }
  while (palette.length < 4) {
    const base = palette[0];
    palette.push([(base[0] + palette.length * 70) % 360, Math.max(40, base[1] - 10), base[2]]);
  }

  const colors = palette.map(([h, s, l]) => `hsl(${h} ${s}% ${l}%)`);
  const top = matched[0]?.tag;
  const second = matched[1]?.tag;
  const a = top && ESSENCE[top];
  const b = second && ESSENCE[second];
  const essence = a && b ? `${a}, against a ${b}` : (a || "swirling mist with sudden light");

  return { colors, primary: colors[0], essence };
}

/* ----- Element ----- */
export type Element = {
  key: "fire" | "water" | "earth" | "air";
  label: string;
  symbol: string;
  tagline: string;
};

const ELEMENT_META: Record<Element["key"], Omit<Element, "key">> = {
  fire:  { label: "Fire",  symbol: "△", tagline: "Drive, edge, motion." },
  water: { label: "Water", symbol: "▽", tagline: "Depth, interiority, feeling." },
  earth: { label: "Earth", symbol: "▢", tagline: "Substance, calm, foundation." },
  air:   { label: "Air",   symbol: "○", tagline: "Playful mind, curiosity, movement." },
};

export function buildElement(moodTagsWeighted: Record<string, number>): Element {
  const scores: Record<Element["key"], number> = { fire: 0, water: 0, earth: 0, air: 0 };
  for (const [tag, w] of Object.entries(moodTagsWeighted)) {
    const m = MOOD[tag.toLowerCase()];
    if (!m || w <= 0) continue;
    scores[m.element] += w;
  }
  let winner: Element["key"] = "air";
  let best = -1;
  for (const k of Object.keys(scores) as Element["key"][]) {
    if (scores[k] > best) { best = scores[k]; winner = k; }
  }
  return { key: winner, ...ELEMENT_META[winner] };
}

/* ----- Constellation ----- */
export type Star = { label: string; x: number; y: number; radius: number; brightness: number };
export type Constellation = { stars: Star[]; edges: Array<[number, number]>; name: string };

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildConstellation(
  topTopics: Array<{ label: string; weight: number; superCount?: number }>,
  seedKey: string,
): Constellation {
  const rng = mulberry32(hashSeed(seedKey || "podiverzum"));
  const stars: Star[] = [];
  const picks = topTopics.slice(0, 7);
  const maxW = Math.max(1, ...picks.map((p) => p.weight));

  const MIN_DIST = 0.18;
  for (const p of picks) {
    let placed: { x: number; y: number } | null = null;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const x = 0.08 + rng() * 0.84;
      const y = 0.12 + rng() * 0.76;
      const ok = stars.every((s) => Math.hypot(s.x - x, s.y - y) > MIN_DIST);
      if (ok) placed = { x, y };
    }
    if (!placed) placed = { x: rng(), y: rng() };
    const w = p.weight / maxW;
    const isSuper = (p.superCount ?? 0) > 0;
    stars.push({
      label: p.label,
      x: placed.x, y: placed.y,
      radius: isSuper ? 6 + w * 4 : 3 + w * 3.5,
      brightness: isSuper ? 1 : 0.55 + w * 0.45,
    });
  }

  const edges: Array<[number, number]> = [];
  const used = new Set<string>();
  for (let i = 0; i < stars.length; i++) {
    const dists = stars
      .map((s, j) => ({ j, d: Math.hypot(s.x - stars[i].x, s.y - stars[i].y) }))
      .filter((d) => d.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { j } of dists) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (used.has(key)) continue;
      used.add(key);
      edges.push([i, j]);
    }
  }
  return { stars, edges, name: constellationName(seedKey, picks[0]?.label) };
}

const PREFIX = ["Lyra", "Aurora", "Nox", "Vox", "Echo", "Vela", "Sol", "Umbra", "Stella", "Cassia", "Astra", "Luna"];
const SUFFIX = ["Curiosa", "Profunda", "Vivax", "Silens", "Audax", "Lucida", "Errans", "Nocturna", "Magna", "Arcana", "Serena", "Ardens"];

function constellationName(seed: string, topTopic?: string): string {
  const rng = mulberry32(hashSeed(seed + "name"));
  const a = PREFIX[Math.floor(rng() * PREFIX.length)];
  const b = SUFFIX[Math.floor(rng() * SUFFIX.length)];
  return topTopic ? `${a} ${b} · ${topTopic}` : `${a} ${b}`;
}

/* ----- Verdict ----- */
const OPENERS: Record<Element["key"], string[]> = {
  fire: [
    "You are Fire: the kind of listener who",
    "Your energy runs hot — you're the kind who",
    "You live near the heat: you're drawn in by shows that",
  ],
  water: [
    "You are deep Water: the kind of listener who",
    "You listen inward — you're drawn to voices that",
    "Your taste shows itself in the quiet — you're the kind who",
  ],
  earth: [
    "You stand on Earth: you're the kind who",
    "Your taste is solid — you love conversations that",
    "You believe in systems — the kind of listener who",
  ],
  air: [
    "You are Air: a curious listener who",
    "Your mind moves — you're the kind of person who",
    "You never stay on one topic for long — the kind who",
  ],
};

const MIDS: Record<Element["key"], string[]> = {
  fire: [
    "isn't afraid of hard questions and feels at home in debate",
    "lights up at a good story and wants to share it before it ends",
    "kicks in when someone finally says what others won't",
  ],
  water: [
    "will sit through the long ones nobody else finishes",
    "notices the details but never loses the big picture",
    "looks for conversations that stay with them for days",
  ],
  earth: [
    "has no patience for shallow hype and prefers facts in motion",
    "stays with the voices saying something real",
    "spots when a guest is just posing",
  ],
  air: [
    "wants depth and a real laugh in the same hour",
    "follows three podcasts at once and pulls something from each",
    "can drop one show mid-episode if a better thread appears",
  ],
};

const ARCHETYPE_NUANCE: Record<string, string[]> = {
  strategic_curious: ["You light up when someone turns chaos into a system."],
  deep_dive: ["A 2-hour episode doesn't scare you — it settles you."],
  future_watcher: ["You want to understand a new technology before you use it."],
  public_radar: ["You'll listen through a public-affairs interview even when it annoys you."],
  story_collector: ["You'll hear out a stranger's life story to the end."],
  market_realist: ["For you, the numbers aren't dry — they're where the conversation starts."],
  culture_hunter: ["A good essay fills you the way a thriller fills other people."],
  science_explorer: ['"Because that\'s how it works" is never enough — you want the mechanism.'],
  meaning_seeker: ["You listen for the honest question, not the tidy answer."],
  calm_observer: ["The quiet voices say more to you than the loud ones."],
  performance_watcher: ["You'll restructure a morning for a good protocol."],
  discovery_listener: ["You never quite know what you'll be listening to tomorrow — and that's the point."],
};

const SECONDARY_FLAVOR: Record<string, string> = {
  ironic: "You can take irony if there's something underneath it.",
  funny: "A well-timed joke counts as much as a deep thought.",
  humor: "Humor isn't decoration for you — it's a register.",
  critical: "You don't swallow what you hear — you turn it over.",
  honest: "You catch dishonesty in under thirty seconds.",
  personal: "You like the episodes where the guest isn't performing.",
  deep: "You also stay for the lower layer.",
  tense: "You handle tension well when you can see why it's there.",
  inspiring: "A good line will travel with you for days.",
};

type VerdictCtx = {
  topMoods?: string[];
  topTopics?: string[];
  archetypeName?: string;
  archetypeId?: string;
  element?: Element["key"];
};

export function buildVerdict(ctx: VerdictCtx, seedKey: string): string {
  const rng = mulberry32(hashSeed(seedKey + "verdict"));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  const el = ctx.element ?? "air";
  const opener = pick(OPENERS[el]);
  const mid = pick(MIDS[el]);
  let line = `${opener} ${mid}.`;

  if (ctx.archetypeId && ARCHETYPE_NUANCE[ctx.archetypeId]) {
    line += ` ${pick(ARCHETYPE_NUANCE[ctx.archetypeId])}`;
  }
  const secondary = ctx.topMoods?.[1];
  if (secondary && SECONDARY_FLAVOR[secondary]) {
    line += ` ${SECONDARY_FLAVOR[secondary]}`;
  }
  return line;
}

/* ----- PDV Code ----- */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function buildPdvCode(seedKey: string): string {
  const rng = mulberry32(hashSeed(seedKey + "pdv"));
  let out = "PDV-";
  for (let i = 0; i < 6; i++) out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return out;
}
