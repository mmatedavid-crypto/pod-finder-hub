import { useSmartPlayer, formatTime } from "./SmartPlayerProvider";

const SPEEDS = [1, 1.25, 1.5, 2];

export function PlayerControls({ compact = false }: { compact?: boolean }) {
  const { isPlaying, toggle, seekBy, playbackRate, setPlaybackRate } = useSmartPlayer();
  return (
    <div className="flex items-center gap-2">
      {!compact && (
        <button
          onClick={() => seekBy(-15)}
          className="px-2 py-1 rounded-md text-xs hover:bg-secondary"
          aria-label="Back 15 seconds"
        >−15s</button>
      )}
      <button
        onClick={toggle}
        className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "❚❚" : "▶"}
      </button>
      {!compact && (
        <>
          <button
            onClick={() => seekBy(30)}
            className="px-2 py-1 rounded-md text-xs hover:bg-secondary"
            aria-label="Forward 30 seconds"
          >+30s</button>
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="text-xs bg-secondary rounded-md px-1.5 py-1"
            aria-label="Playback speed"
          >
            {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
          </select>
        </>
      )}
    </div>
  );
}

export function PlayerProgress({ compact = false }: { compact?: boolean }) {
  const { currentTime, duration, seekTo } = useSmartPlayer();
  const pct = duration ? (currentTime / duration) * 100 : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      {!compact && <span className="text-[10px] tabular-nums text-muted-foreground w-10 text-right">{formatTime(currentTime)}</span>}
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.floor(duration))}
        value={Math.floor(currentTime)}
        onChange={(e) => seekTo(Number(e.target.value))}
        className="flex-1 h-1 accent-primary"
        aria-label="Seek"
        style={{ background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--secondary)) ${pct}%)` }}
      />
      {!compact && <span className="text-[10px] tabular-nums text-muted-foreground w-10">{formatTime(duration)}</span>}
    </div>
  );
}
