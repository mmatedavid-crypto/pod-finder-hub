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
        <p className="text-muted-foreground !mt-2 text-base">
          Podiverzum is built for people who listen for ideas — not just shows.
        </p>
        <p>
          Start with what you're curious about — not the show name. Search across podcasts by the topic, person, company or idea you care about, and surface the episodes actually discussing it.
        </p>
        <p>
          We index public podcast RSS feeds and link listeners back to the original publisher — Apple Podcasts, Spotify, YouTube, the show's website or wherever the creator publishes. We do not host audio. The index currently covers more than 700,000 episodes and keeps growing.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Why it exists</h2>
        <p>
          Spotify and Apple Podcasts are great when you already know the show. They're built around the feeds you already follow.
        </p>
        <p>
          But most of what's worth hearing lives outside them. If you want recent episodes about Nvidia earnings, the Federal Reserve, GLP-1 drugs, AI regulation or European politics, you have to guess at titles or scroll through individual feeds.
        </p>
        <p>
          Podiverzum is the layer in between — a searchable, ranked index of episodes, shows, topics, people, companies and ideas, pulling relevant conversations from across different podcasts.
        </p>

        <h2 className="mt-10 text-xl font-semibold">What we do</h2>
        <ul className="list-disc pl-5">
          <li>Continuously index public podcast RSS feeds.</li>
          <li>Match queries against what episodes actually discuss — topics, people, companies and ideas.</li>
          <li>Rank using relevance, freshness, source quality and feed signals.</li>
          <li>Link listeners back to the original publisher.</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">What we don't do</h2>
        <ul className="list-disc pl-5">
          <li>We don't host or stream audio. Audio belongs to its creators and publishers.</li>
          <li>We don't sell personal data. See <Link to="/privacy" className="text-primary hover:underline">Privacy</Link>.</li>
          <li>We don't sell paid placement in rankings.</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">Status</h2>
        <p>
          The index keeps growing. Search, ranking and discovery surfaces continue to evolve as more episodes are connected.
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
