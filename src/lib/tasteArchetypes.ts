// Deterministic archetype mapping for the result page.
// Score each archetype by summing tagWeight × affinity. Highest wins.
// English-only. Affinity keys must match the seeded taste_cards tag vocabulary.

export type Archetype = {
  id: string;
  name: string;
  tagline: string;
  topics: string[];
  affinity: Record<string, number>;
};

export const ARCHETYPES: Archetype[] = [
  {
    id: "strategic_curious",
    name: "The Strategic Mind",
    tagline: "You like a conversation that frames the world systemically — business, decisions, long-term thinking.",
    topics: ["business", "strategy", "leadership"],
    affinity: { business: 3, strategy: 3, leadership: 2, economy: 2, "entrepreneurship": 2, "decision-making": 2 },
  },
  {
    id: "deep_dive",
    name: "The Deep Diver",
    tagline: "You want long, detailed, expert conversations — the shows that actually go under the surface.",
    topics: ["interview", "long-form"],
    affinity: { "long-form": 3, interview: 3, expert: 2, "deep": 2, documentary: 2 },
  },
  {
    id: "future_watcher",
    name: "The Futurewatcher",
    tagline: "AI, technology, what's coming next — you like to look forward and see how the world is changing.",
    topics: ["ai", "technology"],
    affinity: { ai: 3, technology: 3, "frontier-tech": 3, innovation: 2, startups: 1, science: 1 },
  },
  {
    id: "public_radar",
    name: "The Public Radar",
    tagline: "Politics, public life, society — you care what's happening around you and don't look away.",
    topics: ["politics", "society"],
    affinity: { politics: 3, "public-life": 3, society: 2, news: 2, daily: 1 },
  },
  {
    id: "story_collector",
    name: "The Story Collector",
    tagline: "Personal stories, real people, honest conversations — the human side draws you in.",
    topics: ["narrative", "interview"],
    affinity: { narrative: 3, storytelling: 3, interview: 2, "true-crime": 2, personal: 2 },
  },
  {
    id: "market_realist",
    name: "The Market Realist",
    tagline: "Money, markets, investing — the numbers and the real-world flows are what hold your attention.",
    topics: ["finance", "investing"],
    affinity: { finance: 3, investing: 3, economy: 3, markets: 2, macro: 2, business: 1 },
  },
  {
    id: "culture_hunter",
    name: "The Culture Hunter",
    tagline: "Books, film, art, ideas — culture and thinking are where you feel at home.",
    topics: ["culture", "arts"],
    affinity: { culture: 3, arts: 2, literature: 2, books: 2, film: 2, ideas: 2, philosophy: 1, history: 1 },
  },
  {
    id: "science_explorer",
    name: "The Science Explorer",
    tagline: "Science, research, evidence-based thinking — the joy is in actually understanding.",
    topics: ["science", "research"],
    affinity: { science: 3, research: 3, nature: 2, explainer: 2, education: 1 },
  },
  {
    id: "meaning_seeker",
    name: "The Meaning Seeker",
    tagline: "Honest conversations about belief, doubt, purpose — the big questions don't scare you.",
    topics: ["philosophy", "spirituality"],
    affinity: { philosophy: 3, religion: 3, spirituality: 3, ethics: 2, "mental-health": 1, psychology: 1 },
  },
  {
    id: "calm_observer",
    name: "The Calm Observer",
    tagline: "Quieter, more thoughtful, contemplative shows — the slow ones, the ones that breathe.",
    topics: ["contemplative", "slow"],
    affinity: { contemplative: 3, "deep": 2, nature: 1, "mental-health": 2, therapy: 1 },
  },
  {
    id: "performance_watcher",
    name: "The Performance Watcher",
    tagline: "Health, performance, self-improvement — how you operate at your best is the question that matters.",
    topics: ["health", "performance"],
    affinity: { health: 3, wellness: 3, sports: 2, "self-improvement": 3, habits: 2, athletes: 1 },
  },
  {
    id: "discovery_listener",
    name: "The Discovery Listener",
    tagline: "You like the mix — a good show can come from anywhere as long as the conversation is alive.",
    topics: ["discovery", "mixed"],
    affinity: { travel: 2, places: 1, food: 2, comedy: 2, entertainment: 1, lifestyle: 1, humor: 1 },
  },
];

export function pickArchetype(tagWeights: Record<string, number>): Archetype {
  let best = ARCHETYPES[0];
  let bestScore = -Infinity;
  for (const a of ARCHETYPES) {
    let s = 0;
    for (const [tag, aff] of Object.entries(a.affinity)) {
      s += (tagWeights[tag] || 0) * aff;
    }
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return best;
}

// Softmax-style confidence: how dominant is the top archetype?
export function archetypeConfidence(tagWeights: Record<string, number>): number {
  const scores = ARCHETYPES.map((a) => {
    let s = 0;
    for (const [tag, aff] of Object.entries(a.affinity)) s += (tagWeights[tag] || 0) * aff;
    return Math.max(0, s);
  });
  const sum = scores.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  const top = Math.max(...scores);
  return Math.min(1, (top / sum) * ARCHETYPES.length / 3);
}
