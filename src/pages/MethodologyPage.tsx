import Layout from "@/components/Layout";
import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";

export default function MethodologyPage() {
  return (
    <Layout>
      <Seo
        title="How ranking works — Podiverzum"
        description="A high-level overview of how Podiverzum ranks podcasts and episodes."
      />
      <article className="container mx-auto py-12 max-w-2xl prose prose-invert prose-sm sm:prose-base">
        <h1 className="text-3xl font-semibold mb-2">How ranking works</h1>
        <p className="text-muted-foreground !mt-2 text-base">
          Podiverzum uses a mix of relevance, freshness, source quality and feed signals to surface episodes that are more likely to be useful.
        </p>
        <p>
          The exact model is not public. Ranking changes over time, and exposing every detail would make the index easier to game.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Paid placement</h2>
        <p>
          Podiverzum does not sell paid placement in rankings. Any future commercial relationships will be disclosed and will not silently influence ranking.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Main signals</h2>
        <p>The main signals include, but are not limited to:</p>
        <ul className="list-disc pl-5">
          <li><strong>Relevance</strong> — how closely an episode or podcast matches a query, topic or entity.</li>
          <li><strong>Freshness</strong> — how recently a podcast publishes and how current the indexed episode is.</li>
          <li><strong>Source quality</strong> — broad signals that help identify stronger podcast sources.</li>
          <li><strong>Consistency</strong> — whether a show publishes reliably over time.</li>
          <li><strong>Feed health</strong> — whether the RSS feed is technically reliable and usable.</li>
          <li><strong>Context</strong> — whether an episode appears connected to nearby topics, people, companies or ideas in the index.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Ranking may use additional signals beyond this list. Different surfaces — search, category pages, entity pages, daily brief — weight these signals differently.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Search</h2>
        <p>
          Search is designed to understand meaning, not just keywords. When someone searches for a person, company, market theme, health topic or technology, we look for episodes that meaningfully discuss that subject — even when the exact wording differs.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Why rankings change</h2>
        <p>
          Rankings are dynamic. A podcast or episode may move as new content is published, the catalog grows, metadata improves, feeds change, or the system develops a better understanding of the content.
        </p>

        <h2 className="mt-10 text-xl font-semibold">What we avoid</h2>
        <p>
          Podiverzum may exclude or reduce visibility for content that appears broken, duplicated, misleading, spam-like, inactive or unsuitable for default discovery surfaces.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Our principle</h2>
        <p>
          Ranking is designed to make the index more useful for listeners. It is not a popularity chart, and it is not a paid placement system.
        </p>

        <div className="not-prose mt-12 flex flex-wrap gap-3">
          <Link to="/about" className="px-4 py-2 rounded-md bg-secondary text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
            ← About Podiverzum
          </Link>
        </div>
      </article>
    </Layout>
  );
}
