import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE = "https://www.podiverzum.com";

const KIND_PATH: Record<string, string> = {
  person: "person",
  company: "company",
  ticker: "ticker",
  topic: "topic",
};

const KIND_LABEL: Record<string, string> = {
  person: "Személyek",
  company: "Cégek",
  ticker: "Tickerek",
  topic: "Témák",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const recipient: string = body.recipient || "m.mate.david@gmail.com";
    const sinceHours: number | null = typeof body.since_hours === "number" ? body.since_hours : null;
    const onlyKind: string | null = body.kind || null;

    let q = sb.from("entity_profiles")
      .select("kind, slug, display_name, episode_ids, generated_at, bio")
      .order("generated_at", { ascending: false });
    if (sinceHours) {
      q = q.gte("generated_at", new Date(Date.now() - sinceHours * 3600_000).toISOString());
    }
    if (onlyKind) q = q.eq("kind", onlyKind);
    const { data: rows, error } = await q;
    if (error) throw error;

    const filtered = (rows || []).filter((r: any) => r.bio && r.bio.length > 0);
    const byKind = new Map<string, any[]>();
    for (const r of filtered) {
      const k = r.kind as string;
      if (!byKind.has(k)) byKind.set(k, []);
      byKind.get(k)!.push(r);
    }

    const linkGroups = Array.from(byKind.entries()).map(([kind, items]) => ({
      heading: `${KIND_LABEL[kind] || kind} (${items.length})`,
      links: items.map((it: any) => ({
        label: it.display_name,
        url: `${SITE}/${KIND_PATH[kind] || kind}/${it.slug}`,
        meta: `${(it.episode_ids || []).length} epizód`,
      })),
    }));

    const total = filtered.length;
    const title = sinceHours
      ? `Új AI entitás profilok (utolsó ${sinceHours}h) — ${total}`
      : `AI entitás profilok — ${total}`;

    const idem = `entity-report-${new Date().toISOString().slice(0, 13)}-${total}`;

    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    console.log("invoking send-transactional-email", { recipient, total, idem, srkLen: srk.length, anonLen: anon.length });
    const sendResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anon}`,
        apikey: anon,
      },
      body: JSON.stringify({
        templateName: "admin-report",
        recipientEmail: recipient,
        idempotencyKey: idem,
        templateData: {
          title,
          intro: `${total} entitáshoz van AI életrajz. Kattints bármelyikre a profil megnyitásához.`,
          linkGroups,
          notes: sinceHours ? null : `Forrás: entity_profiles. Generálva: ${new Date().toISOString()}`,
        },
      }),
    });
    const sendText = await sendResp.text();
    console.log("send response", sendResp.status, sendText);
    if (!sendResp.ok) {
      return new Response(JSON.stringify({ error: "send failed", status: sendResp.status, body: sendText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, total, groups: linkGroups.length, send: sendText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
