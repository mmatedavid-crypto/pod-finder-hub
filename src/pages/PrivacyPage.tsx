import Layout from "@/components/Layout";
import { Seo } from "@/components/Seo";

export default function PrivacyPage() {
  return (
    <Layout>
      <Seo
        title="Privacy — Podiverzum"
        description="How Podiverzum handles your data: minimal collection, no behavioral tracking, no sale of personal data."
      />
      <article className="container mx-auto py-12 max-w-2xl prose prose-invert prose-sm sm:prose-base">
        <h1 className="text-3xl font-semibold mb-2">Privacy</h1>
        <p className="text-xs text-muted-foreground mb-8">Last updated {new Date().toLocaleDateString()}</p>

        <p>
          Podiverzum is a podcast discovery platform. We aim to collect as little personal data as possible. This page explains what we collect and why.
        </p>

        <h2 className="mt-8 text-xl font-semibold">What we index</h2>
        <p>
          Podcast and episode information is indexed from publicly available RSS feeds and publisher sources. Podiverzum does not host audio.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Infrastructure and technical logs</h2>
        <p>
          Like most web services, our infrastructure providers may process technical logs, including IP addresses, for security, reliability and abuse prevention. We do not build user profiles from IP addresses, and we do not run third-party advertising trackers.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Browser storage</h2>
        <p>
          Podiverzum may store small amounts of data in your browser, such as recently viewed items or interface preferences, to make the product work. This can be cleared through your browser settings.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Feedback you send</h2>
        <p>
          If you use the in-app feedback button, we store what you submit so we can improve the product. A feedback record may include your message, an optional email address (only if you choose to provide one), the page URL, your viewport size and user-agent string, and your most recent search query if you were on the search page. Feedback is visible only to Podiverzum administrators.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Search and page measurement</h2>
        <p>
          To improve search quality and understand which surfaces are useful, we log basic information such as a search query, the number of results returned, the route path, viewport width and a timestamp. This is operational measurement, not behavioral tracking.
        </p>

        <h2 className="mt-8 text-xl font-semibold">AI-assisted features</h2>
        <p>
          When AI-assisted features are used, the query and relevant podcast metadata may be processed to generate search results, summaries or explanations.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Retention</h2>
        <p>
          We keep operational and feedback data only as long as needed to operate, improve and protect the service.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Contact</h2>
        <p>
          For privacy questions, email <a href="mailto:hello@podiverzum.com" className="text-primary hover:underline">hello@podiverzum.com</a>.
        </p>
      </article>
    </Layout>
  );
}
