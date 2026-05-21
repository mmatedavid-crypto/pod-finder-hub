// Shared bot detection. Used to skip AI spend on crawler traffic.
// Conservative: missing/very-short UA also counts as bot.
const BOT_UA_RE = /(bot|crawl|spider|slurp|bing|google|yandex|baidu|duckduck|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegram|discord|preview|prerender|headless|chrome-lighthouse|pagespeed|gtmetrix|ahrefs|semrush|mj12|dotbot|petalbot|applebot|amazonbot|gptbot|claudebot|perplexitybot|ccbot|anthropic-ai|cohere-ai|youbot|diffbot|screaming|sogou|exabot|ia_archiver|archive\.org|bytespider|tiktokspider|meta-external)/i;

export function isBot(req: Request): boolean {
  const ua = req.headers.get("user-agent") || "";
  if (!ua || ua.length < 8) return true;
  return BOT_UA_RE.test(ua);
}
