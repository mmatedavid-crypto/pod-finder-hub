import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { useSmartPlayer, formatTime } from "./SmartPlayerProvider";

export function ShareMomentButton({ className = "" }: { className?: string }) {
  const { currentEpisode, currentTime } = useSmartPlayer();
  const [copied, setCopied] = useState(false);
  if (!currentEpisode) return null;

  const atSec = Math.floor(currentTime);
  const url =
    currentEpisode.podcastSlug && currentEpisode.episodeSlug
      ? `https://podiverzum.com/podcast/${currentEpisode.podcastSlug}/${currentEpisode.episodeSlug}?t=${atSec}`
      : typeof window !== "undefined"
        ? window.location.href
        : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failures; native share may still work.
    }
  };

  const share = async () => {
    if (typeof navigator === "undefined" || !navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: currentEpisode.title,
        text: `${currentEpisode.title} at ${formatTime(atSec)}`,
        url,
      });
    } catch {
      // User cancelled.
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className={`h-9 w-9 rounded-full border border-border bg-background/60 text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center shrink-0 transition-colors ${className}`}
      aria-label={copied ? "Link copied" : "Share this moment"}
      title={copied ? "Link copied" : "Share this moment"}
      onDoubleClick={copyLink}
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : typeof navigator !== "undefined" && navigator.share ? (
        <Share2 className="h-4 w-4" />
      ) : (
        <Link2 className="h-4 w-4" />
      )}
    </button>
  );
}
