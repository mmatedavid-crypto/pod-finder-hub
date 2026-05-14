import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

type Mode = "idle" | "ai-typing" | "ai-asking" | "user-replying";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onReply: (originalQ: string, reply: string) => void;
  aiQuestion: string | null;
  originalQ: string;
  onExitAI: () => void;
  placeholder?: string;
}

const MATRIX_DOC =
  "Matrix-style clarifying question from the AI. Type your reply or press the X to dismiss.";

// Per-character delay. Slower than before for cinematic feel; punctuation pauses extra.
const BASE_DELAY = 75;
const JITTER = 35; // +/- ms randomness
const PUNCT_PAUSE: Record<string, number> = {
  ",": 180,
  ";": 220,
  ":": 200,
  ".": 320,
  "?": 360,
  "!": 320,
  "—": 220,
  "–": 220,
};

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
  const [typed, setTyped] = useState("");
  const [reply, setReply] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const typewriterRef = useRef<number | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }, []);

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

    // Wake-up beat, then typewriter with variable cadence
    const start = window.setTimeout(() => {
      let i = 0;
      const tick = () => {
        i += 1;
        const slice = aiQuestion.slice(0, i);
        setTyped(slice);
        if (i >= aiQuestion.length) {
          setMode("ai-asking");
          return;
        }
        const lastChar = slice[slice.length - 1] ?? "";
        const punct = PUNCT_PAUSE[lastChar] ?? 0;
        const jitter = (Math.random() - 0.5) * 2 * JITTER;
        const delay = Math.max(30, BASE_DELAY + jitter + punct);
        typewriterRef.current = window.setTimeout(tick, delay);
      };
      tick();
    }, 700);
    typewriterRef.current = start;
    return () => {
      if (typewriterRef.current) window.clearTimeout(typewriterRef.current);
    };
  }, [aiQuestion]);

  const inAIMode = mode === "ai-typing" || mode === "ai-asking" || mode === "user-replying";

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
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

  // Trailing block cursor while typing or waiting for reply. Blink via interval.
  const showCursor = mode === "ai-typing" || (mode === "ai-asking" && reply.length === 0);
  const [blinkOn, setBlinkOn] = useState(true);
  useEffect(() => {
    if (!showCursor) { setBlinkOn(true); return; }
    if (mode === "ai-typing") { setBlinkOn(true); return; } // solid while typing
    const id = window.setInterval(() => setBlinkOn((b) => !b), 530);
    return () => window.clearInterval(id);
  }, [showCursor, mode]);
  const baseDisplay = inAIMode ? (mode === "user-replying" ? reply : typed) : value;
  const displayValue = showCursor ? baseDisplay + (blinkOn ? "▮" : " ") : baseDisplay;
  const isReadOnly = mode === "ai-typing";

  // Auto-grow textarea to fit content. Add a small buffer so glyph ascenders
  // (and the Matrix glow) don't get clipped at the top.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }, [displayValue, mode]);

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative max-w-2xl transition-shadow duration-300 ${inAIMode ? "neo-bar-glow" : ""}`}
      role="search"
      aria-label={inAIMode ? MATRIX_DOC : "Search podcast episodes"}
    >
      {inAIMode ? (
        <span
          className="absolute left-3 top-3 text-base leading-none neo-text neo-pulse"
          aria-hidden
        >
          ▸
        </span>
      ) : (
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
      )}

      <textarea
        ref={taRef}
        value={displayValue}
        readOnly={isReadOnly}
        rows={1}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        onChange={(e) => {
          if (isReadOnly) return;
          // Strip the trailing cursor character if it's been included
          const v = e.target.value.replace(/[▮ ]+$/, "");
          if (mode === "ai-asking" || mode === "user-replying") {
            setReply(v);
            setMode("user-replying");
          } else {
            onChange(v);
          }
        }}
        onFocus={() => {
          // First touch on the AI question: clear the bar so the user's reply
          // doesn't collide with the typed-out AI text.
          if (mode === "ai-asking") {
            setReply("");
            setTyped("");
            setMode("user-replying");
          }
        }}
        placeholder={
          mode === "user-replying"
            ? "Type your answer…"
            : inAIMode
              ? ""
              : (placeholder || "e.g. Nvidia data centers")
        }
        className={`w-full pl-10 pr-24 py-3 rounded-md border outline-none transition-colors resize-none overflow-hidden leading-6 ${
          inAIMode
            ? `${mode === "user-replying" ? "neo-input-reply" : "neo-input neo-text"} border-[hsl(120_80%_45%)] bg-black/80`
            : "bg-card border-border focus:border-accent"
        }`}
        aria-live={inAIMode ? "polite" : undefined}
      />

      {inAIMode ? (
        <button
          type="button"
          onClick={handleExit}
          aria-label="Dismiss AI and start a new search"
          className="absolute right-2 top-2 h-8 w-8 rounded-md flex items-center justify-center text-[hsl(120_80%_55%)] hover:bg-[hsl(120_80%_45%/0.15)] transition-colors"
          title="New search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="submit"
          className="absolute right-2 top-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm"
        >
          Search
        </button>
      )}
    </form>
  );
}
