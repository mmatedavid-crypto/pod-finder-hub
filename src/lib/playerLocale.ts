// Locale strings for the Smart Player. Host-based: podiverzum.hu → hu, else en.

export type PlayerLocale = "en" | "hu";

export function getPlayerLocale(): PlayerLocale {
  if (typeof window === "undefined") return "en";
  try {
    const h = window.location.hostname.toLowerCase();
    if (h.endsWith(".hu") || h === "podiverzum.hu") return "hu";
  } catch { /* noop */ }
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
    externalOnly: "This episode is available on its original player.",
    playbackError: "Playback error",
    durationUnknown: "--:--",
  },
  hu: {
    preview: "előnézet",
    playbackSpeed: "Lejátszási sebesség",
    back15: "Vissza 15 másodperc",
    fwd30: "Előre 30 másodperc",
    play: "Lejátszás",
    pause: "Szünet",
    close: "Bezárás",
    open: "Megnyitás",
    seek: "Tekerés",
    resumeFrom: "Folytatás innen",
    loading: "betöltés…",
    externalOnly: "Ezt az epizódot a saját lejátszójában tudod meghallgatni.",
    playbackError: "Lejátszási hiba",
    durationUnknown: "--:--",
  },
};

export function t(key: keyof Dict, locale?: PlayerLocale): string {
  const l = locale || getPlayerLocale();
  return STRINGS[l][key];
}

export function formatSpeedLabel(s: number, locale?: PlayerLocale): string {
  const l = locale || getPlayerLocale();
  const str = l === "hu" ? String(s).replace(".", ",") : String(s);
  return `${str}x`;
}
