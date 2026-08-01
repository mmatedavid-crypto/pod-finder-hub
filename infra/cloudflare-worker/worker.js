/**
 * Podiverzum bot prerender Worker
 * ---------------------------------
 * - Detects AI/SEO crawler User-Agents
 * - For matched routes: serves prerendered HTML from Supabase edge fn
 *   (cached 24h via Cache API)
 * - Everything else: passthrough to Lovable origin
 *
 * Bind this Worker to:  podiverzum.com/*  and  www.podiverzum.com/*
 *
 * No environment variables required — origin and prerender URL are constants.
 */

const PRERENDER_ENDPOINT =
  "https://iqzkayoqqagowvxeaphe.supabase.co/functions/v1/prerender";
const SITEMAP_ENDPOINT =
  "https://iqzkayoqqagowvxeaphe.supabase.co/functions/v1/sitemap";

// Lovable origin host (proxied via Cloudflare). Workers route runs BEFORE
// the proxy returns, so we just `fetch(request)` to passthrough.
//
// Bot UA detection — must be lowercased before matching.
const BOT_UAS = [
  // AI crawlers (this is the main reason we're doing this)
  "gptbot",
  "oai-searchbot",
  "chatgpt-user",
  "claude-web",
  "claudebot",
  "claude-user",
  "claude-searchbot",
  "anthropic-ai",
  "perplexitybot",
  "perplexity-user",
  "google-extended",
  "youbot",
  "ccbot", // Common Crawl, used as training data
  "cohere-ai",
  "diffbot",
  "bytespider",
  "amazonbot",
  "applebot-extended",
  // Classic SEO + social previews (helps when JS isn't executed)
  "googlebot",
  "bingbot",
  "duckduckbot",
  "yandexbot",
  "baiduspider",
  "facebookexternalhit",
  "facebookbot",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "discordbot",
  "telegrambot",
  "whatsapp",
  "embedly",
  "pinterest",
  "redditbot",
  "instagram",
  "iframely",
  "skypeuripreview",
  "viber",
  "snapchat",
  "tumblr",
  "vkshare",
  "applebot",
  "google-pagerenderer",
];

const GENERIC_BOT_RE =
  /(bot|crawler|spider|crawl|preview|fetch|httpclient|http-client|python-requests|libwww|wget|curl|go-http|java\/|okhttp|axios|node-fetch|undici|ruby|httpie|scrapy|headlesschrome|phantomjs|puppeteer|playwright)/i;

function isBot(ua) {
  if (!ua) return false;
  const s = ua.toLowerCase();
  return BOT_UAS.some((b) => s.includes(b)) || GENERIC_BOT_RE.test(s);
}

// Routes we know how to prerender. Anything else falls back to origin.
function shouldPrerender(pathname) {
  if (pathname === "/" || pathname === "") return true;
  if (/^\/(categories|topics|people|companies|daily|toplist|rankings|new|about|methodology|contact|privacy|terms)\/?$/.test(pathname)) return true;
  // /podcast/:slug  or  /podcast/:slug/:episode
  if (/^\/podcast\/[^/]+(\/[^/]+)?\/?$/.test(pathname)) return true;
  if (/^\/category\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/(topic|person|company|ticker|ingredient)\/[^/]+\/?$/.test(pathname)) return true;
  return false;
}

function shouldServeStaticEnglish(pathname) {
  if (pathname === "/" || pathname === "") return true;
  return /^\/(categories|topics|people|companies|daily|toplist|rankings|new|about|methodology|contact|privacy|terms)\/?$/.test(pathname);
}

const LANGUAGE_LEAK_RE = new RegExp(
  "[\\u00e1\\u00e9\\u00ed\\u00f3\\u00f6\\u0151\\u00fa\\u00fc\\u0171\\u00c1\\u00c9\\u00cd\\u00d3\\u00d6\\u0150\\u00da\\u00dc\\u0170]|\\b(" +
    [
      "\\x6d\\x61\\x67\\x79\\x61\\x72",
      "\\x6b\\x65\\x72\\x65\\x73\\x6f",
      "\\x61\\x6a\\x61\\x6e\\x6c\\x6f",
      "\\x66\\x65\\x6c\\x66\\x65\\x64\\x65\\x7a\\x6f",
    ].join("|") +
    ")\\b",
  "i",
);

function hasComLanguageLeak(html) {
  const s = String(html || "").toLowerCase();
  return (
    s.includes("podiverzum" + ".hu") ||
    s.includes("lang=" + "\"h" + "u\"") ||
    s.includes("h" + "u-h" + "u") ||
    LANGUAGE_LEAK_RE.test(html)
  );
}

function englishFallback(pathname) {
  const canonical = `https://podiverzum.com${pathname === "/" ? "/" : pathname}`;
  const title = pathname === "/toplist"
    ? "Podcast Toplist - Podiverzum"
    : "Podiverzum - Find it. Hear it.";
  const description = pathname === "/toplist"
    ? "Cross-platform podcast rankings built from Apple, Spotify and YouTube chart signals."
    : "Search podcast episodes by what they actually discuss: topics, people, companies, tickers, technologies and ideas.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
<link rel="canonical" href="${canonical}" />
<link rel="sitemap" type="application/xml" href="https://podiverzum.com/sitemap.xml" />
<link rel="alternate" type="text/plain" href="https://podiverzum.com/llms.txt" title="LLMs.txt" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${canonical}" />
</head>
<body>
<main>
<h1>Podiverzum</h1>
<p>${description}</p>
<nav>
<a href="https://podiverzum.com/">Home</a>
<a href="https://podiverzum.com/search">Search</a>
<a href="https://podiverzum.com/categories">Categories</a>
<a href="https://podiverzum.com/toplist">Toplist</a>
<a href="https://podiverzum.com/topics">Topics</a>
</nav>
</main>
</body>
</html>`;
}

// Hard-404 these scanner paths regardless of UA. Conservative — no app routes match.
const SCANNER_PATH_REGEX =
  /^\/(wp-admin|wp-login|wp-content|wp-includes|wp-json|xmlrpc\.php|\.env|\.git|\.aws|\.ssh|\.docker|\.vscode|\.idea|phpmyadmin|pma|mysql|adminer|config\.php|configuration\.php|backup|backups|dump|dumps|\.bak|\.sql|\.zip|\.tar|\.tgz|cgi-bin|cgi|owa|autodiscover|ecp|exchange|boaform|HNAP1|hudson|jenkins|solr|jmx-console|manager\/html|actuator|console|telescope|debug|server-status|server-info|api\/login|api\/v1\/login)(\/|$|\.)/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ua = request.headers.get("user-agent") || "";

    // Canonical host enforcement: www.podiverzum.com → podiverzum.com (301).
    // Keeps bots, prerender cache keys, and canonical tags on a single host.
    if (url.hostname === "www.podiverzum.com") {
      const target = `https://podiverzum.com${url.pathname}${url.search}`;
      return Response.redirect(target, 301);
    }

    // Block requests with no/empty User-Agent — real browsers and legit bots
    // always send one. Empty UA = scraper / direct API hit. Allow /sitemap.xml
    // robots.txt, llms.txt, and feed.xml because some fetchers omit UA on those.
    if (
      !ua.trim() &&
      url.pathname !== "/sitemap.xml" &&
      url.pathname !== "/robots.txt" &&
      url.pathname !== "/llms.txt" &&
      url.pathname !== "/feed.xml"
    ) {
      return new Response("Forbidden", {
        status: 403,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "X-Blocked": "no-user-agent",
        },
      });
    }

    if (SCANNER_PATH_REGEX.test(url.pathname)) {
      return new Response("Not Found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
          "X-Blocked": "scanner-path",
        },
      });
    }

    // /search* — server-side noindex for bots. SPA's Helmet noindex isn't
    // visible until JS executes, so emit a tiny noindex stub + X-Robots-Tag
    // header so Googlebot/AI crawlers see it immediately.
    if (
      request.method === "GET" &&
      isBot(ua) &&
      /^\/search(\/|$)/.test(url.pathname)
    ) {
      const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, follow"><title>Search — Podiverzum</title><link rel="canonical" href="https://podiverzum.com/"></head><body><p>Search results are not indexed. <a href="https://podiverzum.com/">Go to homepage</a>.</p></body></html>`;
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "X-Robots-Tag": "noindex, follow",
          "X-Noindex": "search-bot-stub",
          "X-AI-Agent-Friendly": "1",
        },
      });
    }

    // Dynamic sitemap proxy — /sitemap.xml (and /sitemap.xml?type=...) → edge fn.
    // Static public/sitemap.xml is bypassed; Google sees live episode coverage.
    if (request.method === "GET" && url.pathname === "/sitemap.xml") {
      const upstreamUrl = `${SITEMAP_ENDPOINT}${url.search}`;
      try {
        const upstream = await fetch(upstreamUrl, {
          cf: { cacheTtl: 3600, cacheEverything: true },
          headers: { "User-Agent": "podiverzum-cf-worker" },
        });
        if (upstream.ok) {
          const body = await upstream.text();
          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
              "X-Sitemap-Source": "edge-fn",
              "X-AI-Agent-Friendly": "1",
            },
          });
        }
      } catch (_) { /* fall through to origin */ }
      return fetch(request);
    }

    // Only handle GETs from bots on prerenderable paths.
    if (
      request.method !== "GET" ||
      !isBot(ua) ||
      !shouldPrerender(url.pathname)
    ) {
      return fetch(request);
    }

    // Cache key: scheme + host + path (ignore query for stability;
    // we don't prerender per-query variants).
    const cacheKey = new Request(
      `${url.origin}${url.pathname}`,
      { method: "GET" },
    );
    const cache = caches.default;

    // Emergency containment for the .com surface: these pages are too visible
    // to risk stale upstream prerender HTML or old social-preview cache.
    if (shouldServeStaticEnglish(url.pathname)) {
      const fallback = new Response(englishFallback(url.pathname), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300, s-maxage=300",
          "X-Prerender-Static-English": "1",
          "X-AI-Agent-Friendly": "1",
          "Link": `<https://podiverzum.com/llms.txt>; rel="alternate"; type="text/plain"`,
        },
      });
      ctx.waitUntil(cache.put(cacheKey, fallback.clone()));
      return fallback;
    }

    let resp = await cache.match(cacheKey);
    if (resp) {
      const cachedBody = await resp.clone().text();
      if (hasComLanguageLeak(cachedBody)) {
        const fallback = new Response(englishFallback(url.pathname), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            "X-Prerender-Cache": "HIT-DISCARDED",
            "X-Prerender-Guard": "language-leak-fallback",
            "X-AI-Agent-Friendly": "1",
          },
        });
        ctx.waitUntil(cache.put(cacheKey, fallback.clone()));
        return fallback;
      }
      return new Response(resp.body, {
        status: resp.status,
        headers: new Headers([
          ...resp.headers,
          ["X-Prerender-Cache", "HIT"],
        ]),
      });
    }

    // Fetch from Supabase prerender edge fn.
    const prerenderUrl = `${PRERENDER_ENDPOINT}?path=${encodeURIComponent(url.pathname)}`;
    let upstream;
    try {
      upstream = await fetch(prerenderUrl, {
        cf: { cacheTtl: 0, cacheEverything: false },
        headers: { "User-Agent": "podiverzum-cf-worker" },
      });
    } catch (err) {
      // On failure, fall back to origin so the bot still gets *something*.
      return fetch(request);
    }

    if (!upstream.ok) {
      // 4xx/5xx from prerender — fall back to origin.
      return fetch(request);
    }

    const body = await upstream.text();
    const guardedBody = hasComLanguageLeak(body) ? englishFallback(url.pathname) : body;
    const headers = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Prerender-Cache": "MISS",
      "X-Prerender-UA": ua.slice(0, 80),
      "X-AI-Agent-Friendly": "1",
      "Link": `<https://podiverzum.com/llms.txt>; rel="alternate"; type="text/plain"`,
    });
    if (guardedBody !== body) headers.set("X-Prerender-Guard", "language-leak-fallback");
    resp = new Response(guardedBody, { status: upstream.status, headers });

    // Stash in edge cache for next bot hit (24h).
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  },
};
