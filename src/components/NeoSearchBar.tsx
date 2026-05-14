import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Search, Send, X } from "lucide-react";

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
  const isReadOnly = mode === "ai-typing";

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inAIMode) {
      if (isReadOnly) return;
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

  const textareaValue = inAIMode ? reply : value;
  const aiDisplay = typed + (showCursor && blinkOn ? "▮" : "");

  // Auto-grow textarea to fit content. On iOS Safari scrollHeight can lag while
  // a value is being typed programmatically, so estimate wrapped terminal lines too.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const styles = window.getComputedStyle(ta);
    const fontSize = parseFloat(styles.fontSize) || 16;
    const lineHeight = parseFloat(styles.lineHeight) || 28;
    const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const usableWidth = Math.max(1, ta.clientWidth - horizontalPadding);
    const averageMonoChar = fontSize * 0.62;
    const charsPerLine = Math.max(8, Math.floor(usableWidth / averageMonoChar));
    const estimatedLines = Math.max(
      1,
      ...textareaValue.split("\n").map((line) => Math.ceil(Math.max(line.length, 1) / charsPerLine))
    );
    const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const estimatedHeight = estimatedLines * lineHeight + verticalPadding + 8;
    ta.style.height = `${Math.max(ta.scrollHeight + 8, estimatedHeight)}px`;
  }, [textareaValue, mode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (inAIMode) {
    return (
      <form
        onSubmit={handleSubmit}
        className="relative max-w-2xl scroll-mt-32 transition-shadow duration-300 neo-bar-glow"
        role="search"
        aria-label={MATRIX_DOC}
      >
        <div className="relative min-h-[5.25rem] rounded-md border border-[hsl(120_80%_45%)] bg-black/80 px-3 py-4 pl-10 pr-24">
          <span
            className="absolute left-3 top-[1.05rem] text-base leading-none neo-text neo-pulse"
            aria-hidden
          >
            ▸
          </span>
          <div className="neo-text whitespace-pre-wrap break-words leading-7" aria-live="polite">
            {aiDisplay}
          </div>
          <textarea
            ref={taRef}
            value={reply}
            readOnly={isReadOnly}
            disabled={isReadOnly}
            rows={1}
            onKeyDown={handleKeyDown}
            onChange={(e) => {
              setReply(e.target.value);
              if (mode === "ai-asking") setMode("user-replying");
            }}
            onFocus={() => {
              if (mode === "ai-asking") setMode("user-replying");
            }}
            placeholder={isReadOnly ? "" : "Type your answer…"}
            enterKeyHint="send"
            className="mt-3 block w-full min-h-[2rem] resize-none overflow-hidden border-0 bg-transparent p-0 text-base leading-7 outline-none box-border whitespace-pre-wrap break-words neo-input-reply disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={isReadOnly || reply.trim().length === 0}
          aria-label="Send answer"
          className="neo-send-button absolute bottom-2 right-2 inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-35"
          title="Send answer"
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </button>
        <button
          type="button"
          onClick={handleExit}
          aria-label="Dismiss AI and start a new search"
          className="neo-close-button absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md transition-colors"
          title="New search"
        >
          <X className="h-4 w-4" />
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative max-w-2xl scroll-mt-32 transition-shadow duration-300"
      role="search"
      aria-label="Search podcast episodes"
    >
      <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
      <textarea
        ref={taRef}
        value={value}
        rows={1}
        onKeyDown={handleKeyDown}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "e.g. Nvidia data centers"}
        enterKeyHint="search"
        className="w-full min-h-[3.75rem] pl-10 pr-24 py-4 rounded-md border outline-none transition-colors resize-none overflow-hidden block align-top leading-7 box-border whitespace-pre-wrap break-words bg-card border-border focus:border-accent"
      />
      <button
        type="submit"
        className="absolute right-2 top-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm"
      >
        Search
      </button>
    </form>
  );
}
