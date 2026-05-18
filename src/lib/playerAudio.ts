// Detect whether an episode has a usable in-browser audio source.
// Rules: must be a non-empty, http(s) URL, not a Spotify/Apple page,
// preferably ending in a browser-supported audio extension.

const BAD_HOSTS = [
  "open.spotify.com",
  "podcasts.apple.com",
  "music.apple.com",
  "youtube.com",
  "youtu.be",
];

const AUDIO_EXT = /\.(mp3|m4a|mp4|aac|wav|ogg|oga|opus|webm|m3u8)(\?|#|$)/i;

export type AudioSource = {
  url: string;
  likelyDirect: boolean;
};

export function detectAudioSource(ep: { audio_url?: string | null; episode_url?: string | null } | null | undefined): AudioSource | null {
  if (!ep) return null;
  const raw = (ep.audio_url || "").trim();
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (BAD_HOSTS.some((h) => u.hostname.endsWith(h))) return null;
  return { url: raw, likelyDirect: AUDIO_EXT.test(u.pathname) || AUDIO_EXT.test(raw) };
}
