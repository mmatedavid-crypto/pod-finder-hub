## TikTok Content Generator — Fázis 1 (MVP)

Napi 1 db 30–45s 9:16 videó top S-tier epizódból, manuális letöltés admin oldalról. TikTok auto-post Fázis 2.

### Stack
- **Script**: Lovable AI Gateway, `google/gemini-2.5-flash` (hook + 3 insight + CTA, ~90 szó)
- **Voiceover**: ElevenLabs `eleven_turbo_v2_5`, Brian (`nPczCjzI2devNBz1zQrb`)
- **B-roll**: Gemini `google/gemini-3.1-flash-image-preview` — 4 db 9:16 kép a script kulcs-momentumaihoz
- **Subtitles**: ElevenLabs STT `scribe_v2` a generált voiceoveren → word-level timestamps
- **Render**: Creatomate JSON template (cover Ken Burns + képek slideshow + égetett karaoke felirat + waveform overlay) → MP4 URL → letöltés Storage `tiktok-videos` bucketbe
- **Tárolás**: `tiktok_videos` tábla minden artifacttel + Storage public bucket

### Új komponensek

**Tábla `tiktok_videos`** (RLS: public read, admin write):
- episode_id, podcast_id
- script (text), script_model, script_cost_usd
- voiceover_url, voiceover_duration_s, voiceover_cost_usd
- subtitle_words (jsonb word-level timing)
- broll_image_urls (text[])
- video_url, video_duration_s, render_cost_usd
- status: `pending` | `script_done` | `tts_done` | `stt_done` | `images_done` | `rendered` | `failed`
- error, created_at, generated_at, total_cost_usd

**Storage bucket `tiktok-videos`** (public): voiceover.mp3, broll-{1..4}.png, final.mp4

**Edge function `tiktok-generate`** (verify_jwt=false):
- Bemenet: `{ episode_id?, dry_run? }` — ha nincs id, top S-tier ep az utolsó 7 napból, ami még nincs feldolgozva
- 1. Episode + podcast + ai_summary betöltése
- 2. Script generálás Gemini-vel (strict structured output: `{hook, insights[3], cta, broll_prompts[4]}`)
- 3. ElevenLabs TTS Brian hangon → mp3 → Storage
- 4. ElevenLabs STT a friss mp3-on → word-level timing → subtitle_words
- 5. 4 db Gemini image gen (9:16, 1080×1920) → Storage
- 6. Creatomate render call — JSON template-tel összerakva (cover + slideshow Ken Burns + karaoke ASS-szerű felirat overlay + brand watermark)
- 7. Render webhook nélkül: poll a Creatomate API-ra max 60s
- 8. final.mp4 letöltés → Storage → URL ment
- Költségvédelem: napi $2 cap (script ~$0.001, TTS ~$0.10, STT ~$0.02, képek ~$0.05, render ~$0.15)

**Cron**: pg_cron napi 13:00 UTC (`tiktok-generate`)

**Admin oldal `/admin/tiktok`**:
- Lista (utolsó 30 videó): epizód cím, status badge, költség, létrehozás
- Sor click → preview drawer: video player, script szöveg, b-roll thumbnails, "Download MP4" gomb (Storage signed URL)
- "Generate now" gomb (manuális trigger, ep választás opcionális dropdown S-tier ep-ekből)
- "Regenerate" gomb sor mellett (overwrite)

**Secret**: `CREATOMATE_API_KEY` (ElevenLabs már megvan)

**config.toml**: `[functions.tiktok-generate] verify_jwt = false`

### Implementációs sorrend
1. Plan jóváhagyás
2. Migration: `tiktok_videos` tábla + storage bucket + cron
3. Secret kérés: `CREATOMATE_API_KEY` (Creatomate.com → API → key másolás)
4. Edge function `tiktok-generate`
5. Admin page + route + sidebar link
6. Cron beállítás
7. Manuális teszt 1 epizódon

### Mit NEM tartalmaz (Fázis 2)
- TikTok OAuth + draft inbox API push
- Multi-variant A/B (több hook variáns)
- Háttérzene
- Saját voice clone

Folytatjam a tábla migrációval és a secret kéréssel?
