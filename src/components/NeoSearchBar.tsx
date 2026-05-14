import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

type Mode = "idle" | "ai-typing" | "ai-asking" | "user-replying";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Submit a brand-new search (clears any AI conversation) */
  onSubmit: (v: string) => void;
  /** Submit a follow-up reply that should be combined with the original query */
  onReply: (originalQ: string, reply: string) => void;
  /** Set when the AI has decided to ask. Clearing it returns the bar to idle. */
  aiQuestion: string | null;
  /** The original query the AI is asking about (so we can compose the follow-up) */
  originalQ: string;
  /** Called when user dismisses the AI ([✕] click) */
  onExitAI: () => void;
  placeholder?: string;
}

const MATRIX_DOC =
  "Matrix-style clarifying question from the AI. Type your reply or press the X to dismiss.";

export default function NeoSearchBar({
  value,
  onChange,
  onSubmit,
  onReply,
  aiQuestion,
  originalQ,
  onExitAI,
  placeholder,
}: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [typed, setTyped] = useState(""); // typewriter progress of the AI question
  const [reply, setReply] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const typewriterRef = useRef<number | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }, []);

  // Drive the wake-up + typewriter sequence whenever a new aiQuestion arrives.
  useEffect(() => {
    if (typewriterRef.current) {
      window.clearTimeout(typewriterRef.current);
      typewriterRef.current = null;
    }
    if (!aiQuestion) {
      setMode("idle");
      setTyped("");
      setReply("");
      return;
    }
    setReply("");
    setTyped("");
    setMode("ai-typing");

    if (reducedMotion.current) {
      setTyped(aiQuestion);
      setMode("ai-asking");
      return;
    }

    // 600ms wake-up beat, then typewriter
    const start = window.setTimeout(() => {
      let i = 0;
      const tick = () => {
        i += 1;
        setTyped(aiQuestion.slice(0, i));
        if (i >= aiQuestion.length) {
          setMode("ai-asking");
          return;
        }
        typewriterRef.current = window.setTimeout(tick, 38);
      };
      tick();
    }, 600);
    typewriterRef.current = start;
    return () => {
      if (typewriterRef.current) window.clearTimeout(typewriterRef.current);
    };
  }, [aiQuestion]);

  const inAIMode = mode === "ai-typing" || mode === "ai-asking" || mode === "user-replying";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inAIMode && (mode === "ai-asking" || mode === "user-replying")) {
      const trimmed = reply.trim();
      if (!trimmed) return;
      onReply(originalQ, trimmed);
      setReply("");
      setMode("idle");
      setTyped("");
      return;
    }
    if (value.trim()) onSubmit(value.trim());
  };

  const handleExit = () => {
    if (typewriterRef.current) window.clearTimeout(typewriterRef.current);
    setMode("idle");
    setTyped("");
    setReply("");
    onExitAI();
  };

  // What the input currently shows
  const displayValue = inAIMode ? (mode === "user-replying" ? reply : typed) : value;
  const isReadOnly = mode === "ai-typing";

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative max-w-2xl transition-shadow duration-300 ${inAIMode ? "neo-bar-glow" : ""}`}
      role="search"
      aria-label={inAIMode ? MATRIX_DOC : "Search podcast episodes"}
    >
      {inAIMode ? (
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-base leading-none neo-text neo-pulse"
          aria-hidden
        >
          ▸
        </span>
      ) : (
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      )}

      <input
        ref={inputRef}
        value={displayValue}
        readOnly={isReadOnly}
        onChange={(e) => {
          if (isReadOnly) return;
          if (mode === "ai-asking" || mode === "user-replying") {
            setReply(e.target.value);
            setMode("user-replying");
          } else {
            onChange(e.target.value);
          }
        }}
        onFocus={() => {
          if (mode === "ai-asking") setMode("user-replying");
        }}
        placeholder={inAIMode ? "" : (placeholder || "e.g. Nvidia data centers")}
        className={`w-full pl-10 pr-24 py-3 rounded-md border outline-none transition-colors ${
          inAIMode
            ? "neo-input neo-text border-[hsl(120_80%_45%)] bg-black/80"
            : "bg-card border-border focus:border-accent"
        }`}
        aria-live={inAIMode ? "polite" : undefined}
      />

      {/* Block cursor while AI is typing or asking, before user starts to type */}
      {(mode === "ai-typing" || mode === "ai-asking") && (
        <span
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 neo-text neo-cursor"
          style={{ left: `calc(2.5rem + ${typed.length}ch)` }}
          aria-hidden
        >
          ▮
        </span>
      )}

      {inAIMode ? (
        <button
          type="button"
          onClick={handleExit}
          aria-label="Dismiss AI and start a new search"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md flex items-center justify-center text-[hsl(120_80%_55%)] hover:bg-[hsl(120_80%_45%/0.15)] transition-colors"
          title="New search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm"
        >
          Search
        </button>
      )}
    </form>
  );
}
