import { useState } from "react";
import { Share2, Check, Link2 } from "lucide-react";

type Kind = "episode" | "podcast" | "page";

export function SharePanel({ title, url, kind = "page" }: { title: string; url?: string; kind?: Kind }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");

  const shareLabel = kind === "episode" ? "Share episode" : kind === "podcast" ? "Share podcast" : "Share";
  const copyLabel = kind === "episode" ? "Copy episode link" : kind === "podcast" ? "Copy podcast link" : "Copy link";

  const onShare = async () => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try { await (navigator as any).share({ title, url: shareUrl }); return; } catch {}
    }
    onCopy();
  };
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button onClick={onShare} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-border bg-card hover:border-primary/40 text-sm" aria-label={shareLabel}>
        <Share2 className="h-4 w-4" /> Share
      </button>
      <button onClick={onCopy} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-border bg-card hover:border-primary/40 text-sm" aria-label={copyLabel}>
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
