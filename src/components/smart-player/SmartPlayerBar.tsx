import { Link } from "react-router-dom";
import { useSmartPlayer, formatTime } from "./SmartPlayerProvider";
import { PlayerProgress } from "./PlayerControls";

export function SmartPlayerBar() {
  const {
    playerVisible, currentEpisode, isPlaying, isLoading, error,
    toggle, seekBy, currentTime, duration, expanded, setExpanded, stop, previewActive,
  } = useSmartPlayer();

  if (!playerVisible || !currentEpisode) return null;

  const ep = currentEpisode;
  const href = ep.podcastSlug && ep.episodeSlug ? `/podcast/${ep.podcastSlug}/${ep.episodeSlug}` : null;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        role="region"
        aria-label="Smart Player"
      >
        {previewActive && (
          <div className="absolute -top-5 left-3 text-[9px] uppercase tracking-[0.18em] text-primary bg-card border border-primary/40 rounded-t-md px-1.5 py-0.5">
            Smart Player preview
          </div>
        )}
        <div className="container mx-auto px-3 py-2 flex items-center gap-3">
          {ep.imageUrl && (
            <img src={ep.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover shrink-0 border border-border" />
          )}
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => setExpanded(true)}
            aria-label="Open player"
          >
            <div className="text-sm font-medium truncate">{ep.title}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {ep.podcastTitle}
              {duration > 0 && (
                <span className="ml-2 tabular-nums">· {formatTime(currentTime)} / {formatTime(duration)}</span>
              )}
              {isLoading && <span className="ml-2">· loading…</span>}
              {error && <span className="ml-2 text-amber-500">· {error}</span>}
            </div>
          </button>
          <div className="hidden sm:flex items-center gap-1">
            <button onClick={() => seekBy(-15)} className="text-xs px-2 py-1 rounded-md hover:bg-secondary" aria-label="Back 15s">−15</button>
            <button onClick={() => seekBy(30)} className="text-xs px-2 py-1 rounded-md hover:bg-secondary" aria-label="Forward 30s">+30</button>
          </div>
          <button
            onClick={toggle}
            className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>
          <button
            onClick={stop}
            className="text-muted-foreground hover:text-foreground text-xs px-1.5 hidden sm:inline-flex"
            aria-label="Close player"
          >✕</button>
        </div>
        <div className="container mx-auto px-3 pb-2">
          <PlayerProgress compact />
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          role="dialog"
          aria-label="Expanded player"
        >
          <div className="flex items-center justify-between p-3 border-b border-border">
            <button onClick={() => setExpanded(false)} className="text-sm text-muted-foreground">▾ Bezárás</button>
            {href && (
              <Link to={href} onClick={() => setExpanded(false)} className="text-xs text-accent">Megnyitás</Link>
            )}
          </div>
          <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-5">
            {ep.imageUrl && (
              <img src={ep.imageUrl} alt="" className="h-56 w-56 rounded-xl object-cover border border-border" />
            )}
            <div className="text-center max-w-md">
              <div className="text-lg font-semibold">{ep.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{ep.podcastTitle}</div>
            </div>
            <div className="w-full max-w-md">
              <PlayerProgress />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => seekBy(-15)} className="px-3 py-2 rounded-md bg-secondary text-sm">−15s</button>
              <button
                onClick={toggle}
                className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? "❚❚" : "▶"}
              </button>
              <button onClick={() => seekBy(30)} className="px-3 py-2 rounded-md bg-secondary text-sm">+30s</button>
            </div>
            <SpeedPicker />
          </div>
        </div>
      )}
    </>
  );
}

function SpeedPicker() {
  const { playbackRate, setPlaybackRate } = useSmartPlayer();
  return (
    <div className="flex gap-1">
      {[1, 1.25, 1.5, 2].map((s) => (
        <button
          key={s}
          onClick={() => setPlaybackRate(s)}
          className={`text-xs px-2 py-1 rounded-md border ${playbackRate === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"}`}
        >{s}x</button>
      ))}
    </div>
  );
}
