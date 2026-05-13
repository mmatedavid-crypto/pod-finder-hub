import Layout from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { Mail } from "lucide-react";

const EMAIL = "hello@podiverzum.com";

function MailItem({ subject, label, description }: { subject: string; label: string; description: string }) {
  const href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4 sm:p-5">
      <h2 className="font-semibold">{label}</h2>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
      <a href={href} className="inline-flex items-center gap-1.5 mt-3 text-sm text-primary hover:underline">
        <Mail className="h-3.5 w-3.5" /> {EMAIL}
      </a>
    </div>
  );
}

export default function ContactPage() {
  return (
    <Layout>
      <Seo
        title="Contact Podiverzum"
        description="Reach Podiverzum for listener feedback, podcast publisher requests or business inquiries."
        canonical="https://podiverzum.com/contact"
      />
      <article className="container mx-auto py-12 max-w-2xl">
        <h1 className="text-3xl font-semibold mb-2">Contact Podiverzum</h1>
        <p className="text-muted-foreground">
          For feedback, publisher requests or business inquiries, you can reach us at{" "}
          <a href={`mailto:${EMAIL}`} className="text-primary hover:underline">{EMAIL}</a>.
        </p>

        <div className="mt-8 grid gap-3 sm:gap-4">
          <MailItem
            label="Listener feedback"
            description="For search issues, missing shows, broken links or general product feedback."
            subject="Podiverzum feedback"
          />
          <MailItem
            label="Podcast owners and publishers"
            description="For metadata corrections, feed updates, removal requests or ownership questions."
            subject="Podcast owner request"
          />
          <MailItem
            label="Business and press"
            description="For partnerships, media inquiries or other requests."
            subject="Business inquiry"
          />
        </div>
      </article>
    </Layout>
  );
}
