/** Build a Podiverzum-hosted OG image URL for the given subject. */
export function ogImageUrl(params: {
  kind: "episode" | "podcast" | "site";
  title: string;
  subtitle?: string;
  image?: string | null;
}): string {
  const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
  if (!projectId) return "https://podiverzum.com/og-image.png";
  const url = new URL(`https://${projectId}.supabase.co/functions/v1/og-image`);
  url.searchParams.set("kind", params.kind);
  url.searchParams.set("title", (params.title || "Podiverzum").slice(0, 120));
  if (params.subtitle) url.searchParams.set("subtitle", params.subtitle.slice(0, 80));
  if (params.image) url.searchParams.set("image", params.image);
  return url.toString();
}

/** Build a schema.org BreadcrumbList JSON-LD object. */
export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/** Origin helper: SSR-safe; defaults to canonical site origin. */
export function siteOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return "https://podiverzum.com";
}
