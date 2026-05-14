// search-chat: conversational search assistant. Given the message history and
// the current query's top results, produce a short natural reaction + optional
// follow-up question. Acts like a real AI chat.
// POST { messages: [{role, content}], q: string, topResults: [{title, podcast, summary}] }
// -> { reply: string, done: boolean }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Msg = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const messages: Msg[] = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const q = String(body.q || "").trim();
    const results = (Array.isArray(body.topResults) ? body.topResults : []).slice(0, 6);

    if (!LOVABLE_API_KEY || !q) {
      return new Response(JSON.stringify({ reply: "", done: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const compact = results.map((r: any, i: number) => ({
      i: i + 1,
      title: String(r.title || "").slice(0, 120),
      podcast: String(r.podcast || "").slice(0, 60),
      summary: String(r.summary || "").slice(0, 180),
    }));

    const sys = [
      "You are Neo, a terse podcast search assistant inside a 1990s-style green terminal.",
      "Style: short, direct, lowercase-friendly, no greetings, no emojis, no markdown. Max 2 sentences.",
      "You are mid-conversation. React naturally to what the user just said and to the new search results — like a human chat partner, not a form.",
      "If results clearly span multiple meanings still, ask ONE concise follow-up question and set done=false.",
      "If results look on-target or the user signals they're satisfied, give a one-line confirmation and set done=true.",
      "Never repeat the user's words verbatim. Never list the results. Never use the word 'clarify'.",
      "Always end with a question mark when done=false; end with a period when done=true.",
    ].join(" ");

    const resultsBlock = compact.length
      ? compact.map((c) => `[${c.i}] "${c.title}" — ${c.podcast}\n  ${c.summary}`).join("\n")
      : "(no results)";

    const userTurn = `Current refined query: "${q}"\n\nNew top results:\n${resultsBlock}\n\nReact and decide if more refinement is needed.`;

    const tools = [{
      type: "function",
      function: {
        name: "neo_reply",
        description: "Conversational reaction with optional follow-up.",
        parameters: {
          type: "object",
          properties: {
            reply: { type: "string", description: "Short natural reply, max 160 chars." },
            done: { type: "boolean", description: "True if no further question is needed." },
          },
          required: ["reply", "done"],
          additionalProperties: false,
        },
      },
    }];

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          ...messages.map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 400) })),
          { role: "user", content: userTurn },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "neo_reply" } },
        temperature: 0.5,
      }),
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.warn("search-chat ai", resp.status);
      return new Response(JSON.stringify({ reply: "", done: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    let reply = ""; let done = true;
    if (call?.function?.arguments) {
      try {
        const parsed = JSON.parse(call.function.arguments);
        reply = String(parsed.reply || "").trim().slice(0, 200);
        done = !!parsed.done;
      } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ reply, done }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-chat err", e);
    return new Response(JSON.stringify({ reply: "", done: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
