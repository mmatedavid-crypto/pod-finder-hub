import { useSmartPlayer, SmartPlayerEpisode, detectAudioSource } from "./SmartPlayerProvider";
import { PlayerControls, PlayerProgress } from "./PlayerControls";
import { getProgress } from "@/lib/playerProgress";
import { TasteFeedbackButtons } from "./TasteFeedbackButtons";

type Props = {
  episode: {
    id: string;
    title: string;
    display_title?: string | null;
    audio_url?: string | null;
    episode_url?: string | null;
    image_url?: string | null;
    slug?: string | null;
  };
  podcast: {
    id: string;
    title: string;
    display_title?: string | null;
    image_url?: string | null;
    slug?: string | null;
  };
};

export function EpisodeAudioPlayer({ episode, podcast }: Props) {
  const { playerVisible, previewActive, currentEpisode, isPlaying, play, toggle } = useSmartPlayer();
  if (!playerVisible) return null;

  const src = detectAudioSource(episode);
  const epTitle = episode.display_title || episode.title;
  const podTitle = podcast.display_title || podcast.title;
  const img = episode.image_url || podcast.image_url || null;

  if (!src) {
    return (
      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <div className="text-xs uppercase tracking-[0.18em] text-amber-500/80 mb-1">
          Smart Player {previewActive ? "· preview" : ""}
        </div>
        Ezt az epizódot jelenleg külső lejátszóban tudod megnyitni.
      </div>
    );
  }

  const ep: SmartPlayerEpisode = {
    id: episode.id,
    title: epTitle,
    podcastId: podcast.id,
    podcastTitle: podTitle,
    podcastSlug: podcast.slug || null,
    episodeSlug: episode.slug || null,
    imageUrl: img,
    audioUrl: src.url,
  };
  const isCurrent = currentEpisode?.id === episode.id;
  const prog = getProgress(episode.id);
  const canResume = !!prog && prog.currentTime > 30 && !prog.completed;

  return (
    <div className="mt-5 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Smart Player {previewActive ? "· preview" : ""}
        </div>
      </div>
      <div className="flex gap-4">
        {img && (
          <img
            src={img}
            alt=""
            className="h-20 w-20 rounded-lg object-cover shrink-0 border border-border"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate" title={epTitle}>{epTitle}</div>
          <div className="text-xs text-muted-foreground truncate">{podTitle}</div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => (isCurrent ? toggle() : play(ep, { resume: canResume }))}
              className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-base"
              aria-label={isCurrent && isPlaying ? "Pause" : "Play"}
            >
              {isCurrent && isPlaying ? "❚❚" : "▶"}
            </button>
            {canResume && !isCurrent && (
              <button
                onClick={() => play(ep, { resume: true })}
                className="text-xs px-2 py-1 rounded-md bg-secondary"
              >Folytatás innen</button>
            )}
            {isCurrent && <PlayerControls />}
          </div>
        </div>
      </div>
      {isCurrent && (
        <div className="mt-3">
          <PlayerProgress />
        </div>
      )}
      <TasteFeedbackButtons episodeId={episode.id} />
    </div>
  );
}
