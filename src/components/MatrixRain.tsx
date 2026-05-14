import { useEffect, useRef, useState } from "react";

const LINES = [
  "wake up, neo...",
  "the podiverzum has you.",
  "follow the white rabbit.",
  "knock, knock.",
];

export default function MatrixRain({ onDone }: { onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lineIdx, setLineIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [closing, setClosing] = useState(false);

  // digital rain
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    };
    resize();
    window.addEventListener("resize", resize);

    const fontSize = 16 * dpr;
    const cols = Math.floor(canvas.width / fontSize);
    const drops = new Array(cols).fill(0).map(() => Math.random() * -50);
    const chars = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789ABCDEF<>/\\|";

    let raf = 0;
    const tick = () => {
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      for (let i = 0; i < drops.length; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const y = drops[i] * fontSize;
        ctx.fillStyle = drops[i] > 0 && Math.random() > 0.97 ? "#d6ffe0" : "#22c55e";
        ctx.fillText(ch, i * fontSize, y);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // typewriter through LINES
  useEffect(() => {
    if (lineIdx >= LINES.length) {
      const t = setTimeout(() => setClosing(true), 900);
      return () => clearTimeout(t);
    }
    const line = LINES[lineIdx];
    let i = 0;
    setTyped("");
    const id = setInterval(() => {
      i++;
      setTyped(line.slice(0, i));
      if (i >= line.length) {
        clearInterval(id);
        setTimeout(() => setLineIdx((n) => n + 1), 1100);
      }
    }, 55);
    return () => clearInterval(id);
  }, [lineIdx]);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => onDone?.(), 700);
    return () => clearTimeout(t);
  }, [closing, onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: "#000",
        animation: closing ? "neo-overlay-fade 700ms forwards" : "fade-in 300ms ease-out",
      }}
      onClick={() => setClosing(true)}
      role="dialog"
      aria-label="matrix"
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="relative text-center px-6" style={{ fontFamily: "monospace" }}>
        <div
          className="text-2xl md:text-4xl"
          style={{
            color: "#22c55e",
            textShadow: "0 0 12px rgba(34,197,94,0.8), 0 0 24px rgba(34,197,94,0.4)",
            letterSpacing: "0.05em",
          }}
        >
          {typed}
          <span className="neo-cursor">▌</span>
        </div>
        <div className="mt-8 text-xs opacity-60" style={{ color: "#22c55e" }}>
          [click to skip]
        </div>
      </div>
    </div>
  );
}
