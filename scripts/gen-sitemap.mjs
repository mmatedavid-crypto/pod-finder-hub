import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SITE = 'https://podiverzum.com';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const esc = s => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const tag = (loc, lastmod, cf='daily', pr='0.6') =>
  `<url><loc>${loc}</loc>${lastmod?`<lastmod>${new Date(lastmod).toISOString()}</lastmod>`:''}<changefreq>${cf}</changefreq><priority>${pr}</priority></url>`;
const wrap = urls => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;

fs.mkdirSync('public/sitemaps', { recursive: true });

// ---- pages.xml (static + categories) ----
const { data: cats = [] } = await sb.from('categories').select('slug,created_at').order('slug');
const { data: hubs } = await sb.from('topic_hubs').select('slug,updated_at,generated_at').eq('active', true).order('sort_order');
const now = new Date().toISOString();
const pages = [
  tag(`${SITE}/`, now, 'daily', '1.0'),
  tag(`${SITE}/categories`, now, 'daily', '0.7'),
  tag(`${SITE}/topics`, now, 'daily', '0.8'),
  tag(`${SITE}/people`, now, 'daily', '0.8'),
  tag(`${SITE}/companies`, now, 'daily', '0.8'),
  tag(`${SITE}/daily`, now, 'daily', '0.7'),
  tag(`${SITE}/toplist`, now, 'daily', '0.7'),
  tag(`${SITE}/new`, now, 'daily', '0.6'),
  tag(`${SITE}/about`, now, 'monthly', '0.4'),
  tag(`${SITE}/methodology`, now, 'monthly', '0.4'),
  tag(`${SITE}/contact`, now, 'monthly', '0.3'),
  tag(`${SITE}/privacy`, now, 'yearly', '0.2'),
  tag(`${SITE}/terms`, now, 'yearly', '0.2'),
  ...cats.map(c => tag(`${SITE}/category/${esc(c.slug)}`, c.created_at, 'daily', '0.8')),
  ...(hubs || []).map(h => tag(`${SITE}/topic/${esc(h.slug)}`, [h.updated_at, h.generated_at].filter(Boolean).sort().pop(), 'weekly', '0.8')),
];
fs.writeFileSync('public/sitemaps/pages.xml', wrap(pages));
console.log('pages.xml:', pages.length, 'urls');

// ---- people.xml (entity_profiles where kind='person') ----
{
  let pf = 0, peopleUrls = [];
  while (true) {
    const { data, error } = await sb.from('entity_profiles')
      .select('slug,updated_at')
      .eq('kind', 'person')
      .order('slug').range(pf, pf + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const p of data) {
      peopleUrls.push(tag(`${SITE}/person/${esc(p.slug)}`, p.updated_at, 'weekly', '0.7'));
    }
    if (data.length < 1000) break;
    pf += 1000;
  }
  fs.writeFileSync('public/sitemaps/people.xml', wrap(peopleUrls));
  console.log('people.xml:', peopleUrls.length, 'urls');
}

// ---- podcasts-1.xml ----
const BAD = new Set(['needs_manual_rss_review','quarantined_spam','confirmed_dead']);
let from = 0, all = [];
while (true) {
  const { data, error } = await sb.from('podcasts')
    .select('slug,updated_at,ai_enriched_at,rss_status,rank_label,shadow_rank_components')
    .or('language.is.null,language.ilike.en%')
    .order('id').range(from, from + 999);
  if (error) throw error;
  if (!data?.length) break;
  for (const p of data) {
    if (p.rss_status === 'failed' || p.rss_status === 'inactive') continue;
    if (p.rank_label === 'E') continue;
    const hs = p.shadow_rank_components?.health_state;
    if (BAD.has(hs)) continue;
    const t = p.rank_label;
    const pr = t === 'S' ? '0.9' : t === 'A' ? '0.8' : t === 'B' ? '0.7' : t === 'C' ? '0.6' : '0.4';
    const lm = [p.updated_at, p.ai_enriched_at].filter(Boolean).sort().pop();
    all.push(tag(`${SITE}/podcast/${esc(p.slug)}`, lm, 'daily', pr));
  }
  if (data.length < 1000) break;
  from += 1000;
}
// chunk into 45k each
const CHUNK = 45000;
const podFiles = [];
for (let i = 0; i < all.length; i += CHUNK) {
  const idx = Math.floor(i / CHUNK) + 1;
  const fname = `podcasts-${idx}.xml`;
  fs.writeFileSync(`public/sitemaps/${fname}`, wrap(all.slice(i, i + CHUNK)));
  podFiles.push(fname);
  console.log(fname + ':', Math.min(CHUNK, all.length - i), 'urls');
}

// ---- episodes (EN, S/A/B, useful text only, recent crawl budget) ----
const epUrls = [];
from = 0;
const SINCE = new Date(Date.now() - 180 * 86400_000).toISOString();
while (true) {
  const { data, error } = await sb.from('episodes')
    .select('slug,published_at,updated_at,ai_enriched_at,ai_summary,description,podcasts!inner(slug,language,rank_label,rss_status)')
    .gte('published_at', SINCE)
    .or('language.is.null,language.ilike.en%', { referencedTable: 'podcasts' })
    .in('podcasts.rank_label', ['S','A','B'])
    .order('published_at', { ascending: false })
    .range(from, from + 999);
  if (error) throw error;
  if (!data?.length) break;
  for (const e of data) {
    const ps = e.podcasts;
    if (!e.slug || !ps?.slug) continue;
    if (ps.rss_status === 'failed' || ps.rss_status === 'inactive') continue;
    const thin = (e.ai_summary || '').length <= 80 && (e.description || '').length <= 200;
    if (thin) continue;
    const pr = ps.rank_label === 'S' ? '0.8' : ps.rank_label === 'A' ? '0.7' : '0.6';
    const lm = [e.updated_at, e.ai_enriched_at, e.published_at].filter(Boolean).sort().pop();
    epUrls.push(tag(`${SITE}/podcast/${esc(ps.slug)}/${esc(e.slug)}`, lm, 'weekly', pr));
  }
  if (data.length < 1000) break;
  from += 1000;
  if (epUrls.length >= 40000) break;
}
const epFiles = [];
for (let i = 0; i < epUrls.length; i += CHUNK) {
  const idx = Math.floor(i / CHUNK) + 1;
  const fname = `episodes-${idx}.xml`;
  fs.writeFileSync(`public/sitemaps/${fname}`, wrap(epUrls.slice(i, i + CHUNK)));
  epFiles.push(fname);
  console.log(fname + ':', Math.min(CHUNK, epUrls.length - i), 'urls');
}

// ---- sitemap.xml (index) ----
const lastmod = new Date().toISOString();
const entries = [
  `<sitemap><loc>${SITE}/sitemaps/pages.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`,
  `<sitemap><loc>${SITE}/sitemaps/people.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`,
  ...podFiles.map(f => `<sitemap><loc>${SITE}/sitemaps/${f}</loc><lastmod>${lastmod}</lastmod></sitemap>`),
  ...epFiles.map(f => `<sitemap><loc>${SITE}/sitemaps/${f}</loc><lastmod>${lastmod}</lastmod></sitemap>`),
];
const indexXml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</sitemapindex>\n`;
fs.writeFileSync('public/sitemap.xml', indexXml);
console.log('sitemap.xml index entries:', entries.length);
