import { Helmet } from "react-helmet-async";

type SeoProps = {
  title: string;
  description?: string;
  canonical?: string;
  image?: string;
  noindex?: boolean;
  ogType?: "website" | "article";
  jsonLd?: Record<string, any> | Record<string, any>[];
  hreflang?: { lang: string; href: string }[];
};

/**
 * Declarative per-route SEO via react-helmet-async.
 * Auto-cleans on unmount. Prefer this over imperative setSeo() in new code.
 */
export function Seo({
  title,
  description,
  canonical,
  image,
  noindex,
  ogType = "website",
  jsonLd,
  hreflang,
}: SeoProps) {
  const desc = description?.slice(0, 160);
  const t = title.slice(0, 70);
  const href =
    canonical ||
    (typeof window !== "undefined" ? window.location.href.split("?")[0] : undefined);
  const ld = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{t}</title>
      {desc && <meta name="description" content={desc} />}
      <meta name="robots" content={noindex ? "noindex, nofollow" : "index, follow"} />
      {href && <link rel="canonical" href={href} />}

      <meta property="og:title" content={t} />
      <meta property="og:type" content={ogType} />
      {desc && <meta property="og:description" content={desc} />}
      {href && <meta property="og:url" content={href} />}
      {image && <meta property="og:image" content={image} />}

      <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
      <meta name="twitter:title" content={t} />
      {desc && <meta name="twitter:description" content={desc} />}
      {image && <meta name="twitter:image" content={image} />}

      {(hreflang || []).map((h) => (
        <link key={h.lang} rel="alternate" hrefLang={h.lang} href={h.href} />
      ))}

      {ld.map((obj, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(obj)}
        </script>
      ))}
    </Helmet>
  );
}
