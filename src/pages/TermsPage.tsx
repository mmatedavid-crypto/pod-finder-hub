import Layout from "@/components/Layout";
import { Seo } from "@/components/Seo";

export default function TermsPage() {
  return (
    <Layout>
      <Seo
        title="Terms — Podiverzum"
        description="Terms for using Podiverzum, a podcast discovery platform built on public RSS feeds."
      />
      <article className="container mx-auto py-12 max-w-2xl prose prose-invert prose-sm sm:prose-base">
        <h1 className="text-3xl font-semibold mb-2">Terms</h1>
        <p className="text-xs text-muted-foreground mb-8">Last updated {new Date().toLocaleDateString()}</p>

        <h2 className="mt-2 text-xl font-semibold">What Podiverzum is</h2>
        <p>
          Podiverzum indexes publicly available podcast metadata from RSS feeds and publisher sources. We do not host audio. Podcast content, artwork, names and descriptions belong to their respective owners and publishers.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Acceptable use</h2>
        <p>
          Use the service lawfully. Do not scrape, overload or otherwise abuse the service in ways that disrupt availability for others. Do not attempt to bypass technical or security measures.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Rankings and results</h2>
        <p>
          Search results, rankings and discovery surfaces are informational, are produced algorithmically, and may change without notice.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Podcast owners and publishers</h2>
        <p>
          If you are a podcast owner or publisher, you can request metadata corrections, feed updates, removal or raise an ownership question by emailing <a href="mailto:hello@podiverzum.com" className="text-primary hover:underline">hello@podiverzum.com</a>.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Third-party links</h2>
        <p>
          Podiverzum links to external sites including podcast publishers, Apple Podcasts, Spotify, YouTube and others. We are not responsible for the content of those sites.
        </p>

        <h2 className="mt-8 text-xl font-semibold">No warranty</h2>
        <p>
          The service is provided as is. We do our best to keep it accurate and reliable, but we cannot guarantee uninterrupted availability or error-free results.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Contact</h2>
        <p>
          <a href="mailto:hello@podiverzum.com" className="text-primary hover:underline">hello@podiverzum.com</a>
        </p>
      </article>
    </Layout>
  );
}
