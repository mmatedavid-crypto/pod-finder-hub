import Layout from "@/components/Layout";
import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";

export default function AboutPage() {
  return (
    <Layout>
      <Seo
        title="About Podiverzum"
        description="Podiverzum is a podcast discovery platform that helps listeners search episodes by what they actually discuss."
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Podiverzum",
          url: "https://podiverzum.com",
          description:
            "Podcast discovery platform that helps listeners search episodes by what they actually discuss.",
        }}
      />
      <article className="container mx-auto py-12 max-w-2xl prose prose-invert prose-sm sm:prose-base">
        <h1 className="text-3xl font-semibold mb-2">About Podiverzum</h1>
        <p className="text-muted-foreground !mt-2">
          Podiverzum is a podcast discovery platform that helps listeners search episodes by what they actually discuss — not only by show title, category or chart position.
        </p>
        <p>
          We index public podcast RSS feeds and link listeners back to the original publisher — Apple Podcasts, Spotify, YouTube, the show's website or wherever the creator publishes. We do not host audio.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Why Podiverzum exists</h2>
        <p>
          Most podcast apps are designed around shows you already follow. Discovery across the wider catalog is still fragmented.
        </p>
        <p>
          If you want to find recent episodes about Nvidia earnings, the Federal Reserve, GLP-1 drugs, AI regulation, longevity or European politics, you usually have to search by title, scroll through individual feeds, or hope the right episode appears in a chart.
        </p>
        <p>
          Podiverzum is built for that missing layer — a searchable, ranked index of episodes, shows, topics, people, companies and ideas.
        </p>

        <h2 className="mt-10 text-xl font-semibold">What we do</h2>
        <ul className="list-disc pl-5">
          <li>Continuously index public podcast RSS feeds.</li>
          <li>Match search queries against what episodes actually discuss, including topics, people, companies and ideas.</li>
          <li>Rank podcasts and episodes using relevance, freshness, source quality and feed health signals.</li>
          <li>Link listeners back to the original publisher.</li>
        </ul>
        <p>
          AI-assisted summaries and matching help make large podcast archives easier to search.
        </p>

        <h2 className="mt-10 text-xl font-semibold">What we don't do</h2>
        <ul className="list-disc pl-5">
          <li>We don't host or stream audio. The audio belongs to its creators and publishers.</li>
          <li>We don't sell personal data. See <Link to="/privacy" className="text-primary hover:underline">Privacy</Link>.</li>
          <li>Podiverzum does not currently sell paid placement in rankings.</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">Status</h2>
        <p>
          Podiverzum is still evolving. The catalog grows regularly, and search quality, rankings and discovery surfaces continue to improve as more episodes are indexed and connected.
        </p>

        <div className="not-prose mt-12 flex flex-wrap gap-3">
          <Link to="/methodology" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
            How we rank →
          </Link>
          <Link to="/contact" className="px-4 py-2 rounded-md bg-secondary text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
            Contact →
          </Link>
        </div>
      </article>
    </Layout>
  );
}
