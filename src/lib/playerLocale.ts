// Locale strings for the Smart Player.
// This branch powers Podiverzum.com, so the player is intentionally English-only.

export type PlayerLocale = "en";

export function getPlayerLocale(): PlayerLocale {
  return "en";
}

type Dict = {
  preview: string;
  playbackSpeed: string;
  back15: string;
  fwd30: string;
  play: string;
  pause: string;
  close: string;
  open: string;
  seek: string;
  resumeFrom: string;
  loading: string;
  externalOnly: string;
  playbackError: string;
  durationUnknown: string;
  fallbackUnavailable: string;
  openOriginal: string;
};

const STRINGS: Record<PlayerLocale, Dict> = {
  en: {
    preview: "preview",
    playbackSpeed: "Playback speed",
    back15: "Back 15 seconds",
    fwd30: "Forward 30 seconds",
    play: "Play",
    pause: "Pause",
    close: "Close",
    open: "Open",
    seek: "Seek",
    resumeFrom: "Resume",
    loading: "loading…",
    externalOnly: "Playback is not available here. Open the original page to listen.",
    playbackError: "Playback error",
    durationUnknown: "--:--",
    fallbackUnavailable: "Playback is not available here right now. Open the original page to listen.",
    openOriginal: "Open original page",
  },
};

export function t(key: keyof Dict, locale?: PlayerLocale): string {
  const l = locale || getPlayerLocale();
  return STRINGS[l][key];
}

export function formatSpeedLabel(s: number, locale?: PlayerLocale): string {
  return `${String(s)}x`;
}
