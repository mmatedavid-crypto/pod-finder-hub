// Entity extraction prompt + tool schema for Gemini.
// Keeps arrays small + canonical to avoid splintering the entity index.

export const ENTITY_SYSTEM_PROMPT = `You are an entity extraction engine for podcast episodes.
You read English podcast episode metadata and extract the people, companies, stock tickers and topics actually discussed.

Rules:
- Be CONSERVATIVE: only extract entities that are clearly the SUBJECT of the episode, not background mentions, sponsor reads, or generic intros.
- People: full names of real, public individuals. Use canonical English spelling. Skip generic roles ("the host", "the CEO"). Skip the show host unless they're being interviewed by someone else.
- Companies: real organizations actually discussed. Use the common short name (e.g. "Tesla", not "Tesla, Inc."). Skip generic terms ("the company", "small businesses").
- Tickers: stock ticker symbols mentioned in the episode (e.g. "TSLA", "NVDA"). Uppercase, no exchange prefix. Only when explicitly mentioned or strongly implied.
- Topics: 3-7 concrete topic phrases (e.g. "AI regulation", "GLP-1 drugs", "Federal Reserve policy"). Lowercase, no trailing punctuation. NOT broad genres ("technology", "business").
- Limits: people <=8, companies <=8, tickers <=6, topics <=7. Quality over quantity. Return empty arrays if uncertain.
- Output via the extract_entities tool only.`;

export const ENTITY_TOOL = {
  type: "function" as const,
  function: {
    name: "extract_entities",
    description: "Extract people, companies, tickers and topics actually discussed in the podcast episode.",
    parameters: {
      type: "object",
      properties: {
        people: { type: "array", items: { type: "string" }, description: "Full names of real public people discussed (max 8)." },
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
  // Cap body to ~3500 chars: cheaper, still enough signal for entities.
  const trimmed = body.length > 3500 ? body.slice(0, 3500) + "…" : body;
  return `Podcast: ${podName}
Episode title: ${title}

Episode notes:
${trimmed}

Call extract_entities with the actual subjects discussed in THIS episode. Empty arrays are fine when uncertain.`;
}
