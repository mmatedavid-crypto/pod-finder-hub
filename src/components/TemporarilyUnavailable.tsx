import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";

/** Transient load failure. Intentionally renders no robots/Seo tags. */
export default function TemporarilyUnavailable({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <Layout>
      <div className="container mx-auto py-20 max-w-xl text-center">
        <h1 className="text-2xl font-semibold">{label} is temporarily unavailable</h1>
        <p className="text-muted-foreground mt-3">We couldn't load these episodes right now. Please try again in a moment.</p>
        <Button className="mt-6" onClick={onRetry}>Retry</Button>
      </div>
    </Layout>
  );
}
