# Follow-up after the canonical fix went live

The canonical fix is live on podiverzum.com, served by deployment `f29134b3-…`. Each page now ends up with one canonical and one og:url pointing at itself. The live check turned up two remaining problems.

## 1. Two robots tags on every page (frontend, small)
After the page loads there are two `<meta name="robots">` tags: a fixed one from the shared shell (`index, follow, max-snippet…`) and one from the page itself. On `/topic/ai-agents` they disagree: the shell says `index` and the page says `noindex, follow`.

Fix: move the extra robots directives (`max-snippet:-1, max-image-preview:large, max-video-preview:-1`) into the page-level SEO tag and remove the robots line from the shared shell. Then every page has exactly one robots tag, set by the page.

Check: open home, podcast, episode and `/topic/ai-agents` in a browser. Each should show one robots tag, and the raw page from the server should have none.

## 2. Find out why `/topic/ai-agents` comes out noindex (investigate first)
The bot version of this page (prerender) says `index` and lists episodes, but the browser version marks it `noindex`. This is likely the same pattern as `/topic/artificial-intelligence`: a failed episode lookup gets treated as "no episodes". This is unconfirmed. Step one is to load the page and capture the lookup's error, then fix the page so a failed lookup shows an error and is not marked noindex.

## Out of scope (blocked)
Search bots are not getting the bot version of pages. The Worker's expected behavior did not appear on any request tested. The exact Cloudflare route binding, and whether failures are intermittent, can't be confirmed without read access to Cloudflare. That needs a Cloudflare connection or a check in the Cloudflare dashboard. The sitemap index timeout is also separate.

## Technical details
- Files: `index.html` (remove line 8 robots meta), `src/components/Seo.tsx` (robots content becomes `index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1` when not noindex), and the topic page component after diagnosis.
- No database, Worker, settings or `.hu` changes.
