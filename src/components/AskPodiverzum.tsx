import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, Search } from "lucide-react";

const QUESTIONS = [
  "Nvidia and data centers",
  "GLP-1 drugs and long-term health",
  "AI regulation",
  "founder interviews",
  "sleep and recovery",
  "European politics",
  "Warren Buffett and Apple",
  "longevity science",
];

const ROTATE_MS = 3500;

export function AskPodiverzum() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % QUESTIONS.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused]);

  const visible = Array.from({ length: 3 }, (_, k) => QUESTIONS[(idx + k) % QUESTIONS.length]);

  const go = (query: string) => {
    if (!query.trim()) return;
    nav(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-card/40 p-5 sm:p-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/60 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Natural-language search
        </div>

        <h2 className="mt-3 sm:mt-4 text-2xl sm:text-4xl font-bold tracking-tight max-w-3xl leading-tight">
          Search the way <span className="text-brand-gradient">you think.</span>
        </h2>

        <p className="mt-2 sm:mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
          Describe a topic, person, company or idea. Podiverzum finds episodes that connect — and shows why they match.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); go(q); }}
          className="mt-5 sm:mt-6 max-w-2xl relative focus-brand rounded-2xl"
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Nvidia and data centers"
            className="w-full pl-12 pr-24 sm:pr-32 py-3.5 sm:py-4 rounded-2xl bg-card/90 backdrop-blur border border-border focus:border-primary/50 outline-none text-base placeholder:text-muted-foreground/60 shadow-elevated"
          />
          <button className="btn-brand absolute right-2 top-1/2 -translate-y-1/2 px-4 sm:px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5">
            Search <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-5 sm:mt-6">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
            Try
          </div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {visible.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => go(question)}
                className="group text-left flex items-start gap-3 p-3 sm:p-3.5 rounded-xl border border-border/70 bg-card/70 hover:bg-card hover:border-primary/40 transition-all duration-300 animate-fade-up"
              >
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0 transition-transform group-hover:scale-110" />
                <span className="text-sm font-medium leading-snug">{question}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
