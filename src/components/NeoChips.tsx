import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type NeoChip = {
  label: string;
  query: string;
  count: number;
  kind: "entity" | "podcast";
  emoji?: string;
};

interface Props {
  mode: "ambiguity" | "zero_hit";
  message: string;
  chips: NeoChip[];
  /** Default render is a small pulsing badge; click expands to show chips + message. */
  defaultExpanded?: boolean;
  onPick: (chip: NeoChip) => void;
  onDismiss: () => void;
}

const STORAGE_PREFIX = "neo:";

export default function NeoChips({ mode, message, chips, defaultExpanded, onPick, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const [typed, setTyped] = useState("");

  // Typewriter for the message — only when expanded.
  useEffect(() => {
    if (!expanded) { setTyped(""); return; }
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setTyped(message); return; }
    let i = 0;
    let t: number | undefined;
    const tick = () => {
      i += 1;
      setTyped(message.slice(0, i));
      if (i < message.length) t = window.setTimeout(tick, 28 + Math.random() * 18);
    };
    t = window.setTimeout(tick, 200);
    return () => { if (t) window.clearTimeout(t); };
  }, [expanded, message]);

  const handleDismiss = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + "closeCount");
      const n = (raw ? parseInt(raw, 10) : 0) + 1;
      sessionStorage.setItem(STORAGE_PREFIX + "closeCount", String(n));
      if (n >= 2) {
        sessionStorage.setItem(STORAGE_PREFIX + "mutedUntil", String(Date.now() + 24 * 3600 * 1000));
      }
    } catch { /* ignore */ }
    onDismiss();
  };

  if (!expanded) {
    return (
      <div className="mt-2 flex items-center gap-2 max-w-2xl">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="neo-text neo-pulse inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] px-2 py-1 rounded border border-[hsl(120_60%_30%/0.45)] hover:border-[hsl(120_100%_45%)] transition-colors"
          aria-label="Open Neo suggestions"
        >
          <span aria-hidden>▸</span> neo · {chips.length} suggestion{chips.length === 1 ? "" : "s"}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 max-w-2xl neo-panel rounded-md px-3 py-2 neo-bar-glow relative">
      <div className="flex items-center gap-2 border-b border-[hsl(120_60%_30%/0.45)] pb-1.5 mb-2">
        <span className="neo-text neo-pulse text-xs tracking-widest" aria-hidden>●</span>
        <span className="neo-text text-[11px] uppercase tracking-[0.2em] opacity-80">
          neo · {mode === "zero_hit" ? "closest match" : "disambiguate"}
        </span>
        <button
          type="button"
          onClick={handleDismiss}
          className="ml-auto neo-close-button h-6 w-6 inline-flex items-center justify-center rounded-md"
          aria-label="Close"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-2 leading-6">
        <span className="neo-text neo-pulse shrink-0" aria-hidden>▸</span>
        <div className="neo-text text-sm whitespace-pre-wrap break-words min-h-[1.5rem]">
          {typed}
          {typed.length < message.length && <span className="neo-cursor">▮</span>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((c, i) => (
          <button
            key={`${c.kind}-${c.label}-${i}`}
            type="button"
            onClick={() => onPick(c)}
            className="neo-chip inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[hsl(120_60%_30%/0.55)] hover:border-[hsl(120_100%_45%)] hover:bg-[hsl(120_60%_8%/0.5)] text-[12px] neo-text transition-colors"
            aria-label={`Refine: ${c.label} (${c.count} hits)`}
          >
            {c.emoji && <span aria-hidden>{c.emoji}</span>}
            <span>{c.label}</span>
            <span className="opacity-60 text-[10px]">{c.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function isNeoMuted(): boolean {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + "mutedUntil");
    if (!raw) return false;
    const t = parseInt(raw, 10);
    if (!Number.isFinite(t)) return false;
    return Date.now() < t;
  } catch { return false; }
}

export function markRefined(qHash: string) {
  try { sessionStorage.setItem(STORAGE_PREFIX + "refined:" + qHash, "1"); } catch { /* ignore */ }
}

export function isRefined(qHash: string): boolean {
  try { return sessionStorage.getItem(STORAGE_PREFIX + "refined:" + qHash) === "1"; } catch { return false; }
}
