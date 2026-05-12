// Quick test: call Google Gemini API directly (bypassing Lovable Gateway)
// to verify GEMINI_API_KEY works and measure throughput / rate limits.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "GEMINI_API_KEY missing" }, 500);

  const body = await req.json().catch(() => ({}));
  const model = String(body.model || "gemini-2.5-flash-lite");
  const n = Math.max(1, Math.min(50, Number(body.n) || 10));
  const concurrency = Math.max(1, Math.min(20, Number(body.concurrency) || 10));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const tool = {
    functionDeclarations: [{
      name: "podcast_seo",
      description: "Return SEO metadata for a podcast.",
      parameters: {
        type: "object",
        properties: {
          seo_title: { type: "string" },
          seo_description: { type: "string" },
          detected_language: { type: "string" },
        },
        required: ["seo_title", "seo_description", "detected_language"],
      },
    }],
  };

  const sample = (i: number) => ({
    contents: [{
      role: "user",
      parts: [{
        text: `Generate SEO title (≤65 chars) and description (≤160 chars) for podcast #${i}: "The Daily Tech Briefing" — a daily news show covering AI, startups, and big tech. English. Use the podcast_seo function.`,
      }],
    }],
    tools: [tool],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["podcast_seo"] } },
  });

  const started = Date.now();
  let ok = 0, fail = 0, rate_limited = 0;
  const errors: string[] = [];
  const samples: any[] = [];
  let inTok = 0, outTok = 0;

  const run = async (i: number) => {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sample(i)),
      });
      if (r.status === 429) { rate_limited++; fail++; return; }
      if (!r.ok) { fail++; errors.push(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); return; }
      const j = await r.json();
      const fc = j.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;
      if (!fc) { fail++; errors.push("no_function_call"); return; }
      ok++;
      inTok += Number(j.usageMetadata?.promptTokenCount || 0);
      outTok += Number(j.usageMetadata?.candidatesTokenCount || 0);
      if (samples.length < 2) samples.push(fc.args);
    } catch (e: any) { fail++; errors.push(e?.message || "err"); }
  };

  let idx = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = idx++;
      if (i >= n) return;
      await run(i);
    }
  }));

  const elapsed_ms = Date.now() - started;
  return json({
    ok: true, model, requests: n, concurrency, ok_count: ok, fail_count: fail, rate_limited,
    elapsed_ms, throughput_per_sec: +(ok / (elapsed_ms / 1000)).toFixed(2),
    extrapolated_per_minute: Math.round((ok / (elapsed_ms / 1000)) * 60),
    tokens_in: inTok, tokens_out: outTok,
    errors: errors.slice(0, 5), samples,
  });
});
