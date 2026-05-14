import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Search, Send, X } from "lucide-react";

export type NeoTurn = { role: "assistant" | "user"; content: string };

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onReply: (reply: string) => void;
  /** Whole conversation so far. Last turn drives typewriter when it's an assistant message. */
  turns: NeoTurn[];
  /** True while the AI is "thinking" (search + chat call in flight). */
  thinking?: boolean;
  /** Legacy flag from the assistant; Neo mode stays open until explicit close. */
  done?: boolean;
  onExitAI: () => void;
  placeholder?: string;
}

const BASE_DELAY = 45;
const JITTER = 22;
const PUNCT_PAUSE: Record<string, number> = {
  ",": 120, ";": 160, ":": 140, ".": 220, "?": 240, "!": 220, "—": 160, "–": 160,
};

export default function NeoSearchBar({
  value,
  onChange,
  onSubmit,
  onReply,
  turns,
  thinking,
  done,
  onExitAI,
  placeholder,
}: Props) {
  const inAIMode = turns.length > 0;
  const [reply, setReply] = useState("");
  const [typedMap, setTypedMap] = useState<Record<number, string>>({});
  const [closing, setClosing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const typewriterRef = useRef<number | null>(null);
  const reducedMotion = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset closing state whenever we (re)enter AI mode.
  useEffect(() => { if (inAIMode) setClosing(false); }, [inAIMode]);

  // Glitchy "decoded" overlay characters during exit animation.
  const glitchChars = useMemo(() => "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ01<>/\\$#@*".split(""), []);
  const randGlitch = (n: number) => Array.from({ length: n }, () => glitchChars[Math.floor(Math.random() * glitchChars.length)]).join("");

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }, []);

  // Typewriter for the LAST assistant message that hasn't been fully typed.
  const lastIdx = turns.length - 1;
  const lastTurn = turns[lastIdx];
  useEffect(() => {
    if (typewriterRef.current) {
      window.clearTimeout(typewriterRef.current);
      typewriterRef.current = null;
    }
    if (!lastTurn || lastTurn.role !== "assistant") return;
    if (typedMap[lastIdx] === lastTurn.content) return;

    if (reducedMotion.current) {
      setTypedMap((m) => ({ ...m, [lastIdx]: lastTurn.content }));
      return;
    }

    let i = (typedMap[lastIdx] || "").length;
    const tick = () => {
      i += 1;
      const slice = lastTurn.content.slice(0, i);
      setTypedMap((m) => ({ ...m, [lastIdx]: slice }));
      if (i >= lastTurn.content.length) return;
      const lastChar = slice[slice.length - 1] ?? "";
      const punct = PUNCT_PAUSE[lastChar] ?? 0;
      const jitter = (Math.random() - 0.5) * 2 * JITTER;
      const delay = Math.max(20, BASE_DELAY + jitter + punct);
      typewriterRef.current = window.setTimeout(tick, delay);
    };
    typewriterRef.current = window.setTimeout(tick, 350);
    return () => { if (typewriterRef.current) window.clearTimeout(typewriterRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastIdx, lastTurn?.content]);

  // Auto-scroll to the bottom of the chat as new content arrives
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, typedMap, thinking]);

  // Focus reply textarea when AI is waiting for an answer
  useEffect(() => {
    if (inAIMode && !thinking && !closing && lastTurn?.role === "assistant" &&
        typedMap[lastIdx] === lastTurn.content) {
      replyInputRef.current?.focus({ preventScroll: true });
    }
  }, [inAIMode, thinking, closing, lastIdx, lastTurn, typedMap]);

  const isTyping = !!lastTurn && lastTurn.role === "assistant" && typedMap[lastIdx] !== lastTurn.content;
  const canSendReply = !thinking && !isTyping && !closing && reply.trim().length > 0;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inAIMode) {
      if (!canSendReply) return;
      const trimmed = reply.trim();
      onReply(trimmed);
      setReply("");
      return;
    }
    if (value.trim()) onSubmit(value.trim());
  };

  const handleExit = () => {
    if (closing) return;
    if (typewriterRef.current) window.clearTimeout(typewriterRef.current);
    if (reducedMotion.current) {
      setReply("");
      setTypedMap({});
      onExitAI();
      return;
    }
    setClosing(true);
    // Wait for the Matrix-style collapse to finish, then unmount.
    window.setTimeout(() => {
      setReply("");
      setTypedMap({});
      onExitAI();
    }, 720);
  };

  // Auto-grow textareas
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight + 2}px`;
    }
  }, [value]);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
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
        className={`relative max-w-2xl scroll-mt-32 transition-shadow duration-300 neo-bar-glow neo-chat-enter ${closing ? "neo-chat-exit" : ""}`}
        role="search"
        aria-label="Conversational podcast search"
        aria-busy={closing}
      >
        <div className="neo-panel relative rounded-md px-3 pt-2 pb-3 pr-10 overflow-hidden">
          {/* Header bar — small terminal chrome to feel like a real chat window */}
          <div className="flex items-center gap-2 border-b border-[hsl(120_60%_30%/0.45)] pb-1.5 mb-2">
            <span className="neo-text neo-pulse text-xs tracking-widest" aria-hidden>●</span>
            <span className="neo-text text-[11px] uppercase tracking-[0.2em] opacity-80">
              neo · secure channel
            </span>
            <span className="ml-auto neo-text text-[10px] opacity-60">
              {thinking ? "decrypting…" : "online"}
            </span>
          </div>

          <div
            ref={scrollRef}
            className="min-h-[140px] max-h-[55vh] overflow-y-auto pr-1 space-y-3 neo-scroll"
            aria-live="polite"
          >
            {turns.map((t, i) => {
              if (t.role === "assistant") {
                const text = typedMap[i] ?? (i < lastIdx ? t.content : "");
                const showCursor = i === lastIdx && (text !== t.content);
                return (
                  <div key={i} className="flex gap-2 leading-7">
                    <span className="neo-text neo-pulse shrink-0" aria-hidden>▸</span>
                    <div className="neo-text whitespace-pre-wrap break-words">
                      {text}
                      {showCursor && <span className="neo-cursor">▮</span>}
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="flex justify-end">
                  <div className="neo-user-bubble max-w-[85%] whitespace-pre-wrap break-words rounded-md px-2.5 py-1 text-sm leading-6">
                    {t.content}
                  </div>
                </div>
              );
            })}
            {thinking && (
              <div className="flex gap-2 leading-7">
                <span className="neo-text neo-pulse shrink-0" aria-hidden>▸</span>
                <div className="neo-text neo-thinking">…</div>
              </div>
            )}
          </div>

          {!closing && (
            <div className="mt-2 flex items-end gap-2 border-t border-[hsl(120_60%_30%/0.45)] pt-2">
              <span className="neo-text leading-7 select-none" aria-hidden>›</span>
              <input
                ref={replyInputRef}
                value={reply}
                onKeyDown={handleKeyDown}
                onChange={(e) => setReply(e.target.value)}
                disabled={thinking || isTyping || closing}
                placeholder={thinking ? "thinking…" : isTyping ? "" : "type your answer…"}
                enterKeyHint="send"
                className="flex-1 min-h-[1.75rem] min-w-0 border-0 bg-transparent p-0 text-base leading-7 outline-none neo-input-reply disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!canSendReply}
                aria-label="Send"
                className="neo-send-button inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors disabled:opacity-35"
                title="Send"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Matrix scanlines + glitch overlay during exit */}
          {closing && (
            <div className="neo-exit-overlay pointer-events-none absolute inset-0">
              <div className="neo-scanlines absolute inset-0" aria-hidden />
              <div className="neo-glitch-text absolute inset-0 flex items-center justify-center neo-text text-xs tracking-[0.3em]" aria-hidden>
                {randGlitch(18)}
              </div>
              <div className="neo-collapse-bar absolute inset-x-0 top-1/2" aria-hidden />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleExit}
          aria-label="Close chat"
          className="neo-close-button absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md transition-colors"
          title="Close (disconnect)"
          disabled={closing}
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
