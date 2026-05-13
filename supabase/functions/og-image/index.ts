// OG image edge function: 1200x630 PNG card for podcast/episode/site sharing.
// Renders an SVG composition and rasterizes via resvg-wasm so social platforms
// (Twitter/X, Facebook, LinkedIn, Slack, Discord) accept it.
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const W = 1200;
const H = 630;

let wasmReady = false;
async function ensureWasm() {
  if (wasmReady) return;
  const wasmRes = await fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm");
  if (!wasmRes.ok) throw new Error(`resvg wasm fetch failed: ${wasmRes.status}`);
  await initWasm(await wasmRes.arrayBuffer());
  wasmReady = true;
}

let fontBold: Uint8Array | null = null;
let fontRegular: Uint8Array | null = null;
async function ensureFonts() {
  if (fontBold && fontRegular) return;
  const [b, r] = await Promise.all([
    fetch("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf"),
    fetch("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf"),
  ]);
  if (!b.ok || !r.ok) throw new Error(`font fetch failed: ${b.status}/${r.status}`);
  fontBold = new Uint8Array(await b.arrayBuffer());
  fontRegular = new Uint8Array(await r.arrayBuffer());
}

function escapeXml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = (text || "").trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if (!current) { current = w; continue; }
    if (current.length + 1 + w.length > maxChars) {
      lines.push(current);
      current = w;
      if (lines.length >= maxLines - 1) break;
    } else {
      current += " " + w;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\s+\S*$/, "") + "…";
  }
  return lines;
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!/^image\//i.test(ct)) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > 2_000_000) return null;
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:${ct};base64,${btoa(bin)}`;
  } catch { return null; }
}

function buildSvg(opts: { kind: string; title: string; subtitle: string; coverDataUri: string }): string {
  const { kind, title, subtitle, coverDataUri } = opts;
  const titleLines = wrapText(title, kind === "site" ? 30 : 32, 3);
  const titleFontSize = titleLines.length >= 3 ? 56 : titleLines.length === 2 ? 64 : 72;
  const lineHeight = titleFontSize + 12;

  const coverSize = 360;
  const coverX = 80;
  const coverY = (H - coverSize) / 2;

  const textX = coverDataUri ? coverX + coverSize + 60 : 80;

  const titleSvg = titleLines
    .map((line, i) => `<text x="${textX}" y="${260 + i * lineHeight}" font-family="Inter" font-weight="700" font-size="${titleFontSize}" fill="#ffffff">${escapeXml(line)}</text>`)
    .join("");

  const subtitleSvg = subtitle
    ? `<text x="${textX}" y="220" font-family="Inter" font-weight="700" font-size="28" fill="#a3a3a3" letter-spacing="2">${escapeXml(subtitle.toUpperCase())}</text>`
    : "";

  const coverSvg = coverDataUri
    ? `<image href="${coverDataUri}" x="${coverX}" y="${coverY}" width="${coverSize}" height="${coverSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#coverClip)" />
       <rect x="${coverX}" y="${coverY}" width="${coverSize}" height="${coverSize}" rx="20" fill="none" stroke="#ffffff22" stroke-width="2"/>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a0a" />
      <stop offset="100%" stop-color="#1a0b1f" />
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.15" r="0.7">
      <stop offset="0%" stop-color="#ff2e63" stop-opacity="0.35" />
      <stop offset="60%" stop-color="#ff2e63" stop-opacity="0.05" />
      <stop offset="100%" stop-color="#ff2e63" stop-opacity="0" />
    </radialGradient>
    <clipPath id="coverClip"><rect x="${coverX}" y="${coverY}" width="${coverSize}" height="${coverSize}" rx="20" /></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${coverSvg}
  ${subtitleSvg}
  ${titleSvg}
  <g transform="translate(${textX}, ${H - 90})">
    <circle cx="14" cy="14" r="5" fill="#ff2e63"/>
    <text x="32" y="20" font-family="Inter" font-weight="700" font-size="26" fill="#ffffff">PODIVERZUM</text>
    <text x="32" y="50" font-family="Inter" font-weight="400" font-size="18" fill="#9ca3af">Find it. Hear it.</text>
  </g>
</svg>`;
}

async function rasterize(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  await ensureFonts();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    background: "#0a0a0a",
    font: {
      fontBuffers: [fontRegular!, fontBold!],
      defaultFontFamily: "Inter",
      loadSystemFonts: false,
    },
  });
  return resvg.render().asPng();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const kind = (url.searchParams.get("kind") || "site").slice(0, 20);
  const title = (url.searchParams.get("title") || "Podiverzum — Find it. Hear it.").slice(0, 160);
  const subtitle = (url.searchParams.get("subtitle") || "").slice(0, 120);
  const image = url.searchParams.get("image") || "";

  const coverDataUri = image && /^https?:\/\//.test(image) ? (await fetchImageAsDataUrl(image)) || "" : "";

  try {
    const svg = buildSvg({ kind, title, subtitle, coverDataUri });
    const png = await rasterize(svg);
    return new Response(png, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e: any) {
    console.error("og-image error:", e?.message || e);
    // Fallback: redirect to static OG image so previews never break.
    return Response.redirect("https://podiverzum.com/og-image.png", 302);
  }
});
