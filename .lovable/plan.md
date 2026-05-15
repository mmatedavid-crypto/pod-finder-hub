# Chunking + Transcript Scout

Két párhuzamos pipeline. A chunking azonnal javít minden epizódon; a scout S/A tieren hozza a "valódi tartalmat" ahol publisher/YT már megcsinálta nekünk.

---

## Part A — Chunking pipeline (minden tier)

### 1. Új tábla: `episode_chunks`
```
id uuid pk
episode_id uuid
chunk_idx smallint              -- 0,1,2…
source text                     -- 'description' | 'transcript_rss' | 'transcript_youtube'
text text                       -- 800 char chunk
embedding vector(768)
content_hash text               -- text sha → idempotens upsert
model text
updated_at timestamptz
UNIQUE(episode_id, source, chunk_idx)
```
HNSW cosine index az `embedding`-en. Public read RLS, admin write.

### 2. Új edge function: `embed-chunks-runner`
- Forrás priority: ha van transcript → azt chunkolja, különben `episodes.description`
- Splitter: 800 char window, 200 overlap, mondat-határnál tör (ahol lehet)
- Skip ha: total_text < 1000 char (ott már a sima embedding elég)
- Batch 50 episode/hívás, concurrency 4, Gemini `embedding-001` 768d (mint episode-embed)
- Idempotens: content_hash diff → re-embed; egyébként skip
- Budget: $1/day (chunk volume nagy, de 1× backfill)
- Adaptive cron RPC `set_embed_chunks_schedule` (1m/5m/15m allowlist)

### 3. Cron jobid 40
Init `*/5`, adaptív, async invoke.

### 4. Search integration (search-hybrid)
- Új RPC `search_episode_chunks(query_embedding, limit)` → top-N chunk → group by episode_id, take MAX(similarity)
- Merge chunk-score-t az existing semantic score-ba: `episode_score = max(episode_emb_sim, chunk_max_sim)`
- Feature flag `chunks_enabled` (default true v13-tól), backwards-compatible

---

## Part B — Transcript Scout (S/A tier only)

### 1. Új tábla: `episode_transcripts`
```
episode_id uuid pk
source text                     -- 'rss' | 'youtube'
transcript_url text
format text                     -- 'srt' | 'vtt' | 'json' | 'txt'
text text                       -- plain text (timecodes stripped)
word_count integer
language text
fetched_at timestamptz
last_attempt_at timestamptz
attempts integer default 0
status text                     -- 'found' | 'not_available' | 'failed'
error text
```
Public read, admin write.

### 2. Episodes tábla bővítés
```
ALTER TABLE episodes ADD COLUMN transcript_status text DEFAULT 'unchecked';
-- 'unchecked' | 'found' | 'not_available'
ADD COLUMN next_transcript_check_at timestamptz;
```

### 3. Új edge function: `transcript-scout-runner`
Két forrás, sorrendben próbálva:

**(a) RSS `<podcast:transcript>` tag**
- Letölti a podcast RSS-t (cache: 1 letöltés / podcast / run, parse N item)
- `<podcast:transcript url="…" type="application/srt"/>` szerű tagek keresése
- Letölt → SRT/VTT/JSON parse → plain text
- Limit: 200 KB / transcript

**(b) YouTube auto-captions**
- Csak ha `episodes.youtube_url IS NOT NULL`
- npm `youtube-transcript` package-szel (Deno-compatible) vagy direkt `https://www.youtube.com/api/timedtext?lang=en&v=…`
- VTT/JSON parse → plain text
- Skip ha nincs caption track

**Logika**
- Csak S/A tier podcastok episode-jaira (`podcasts.shadow_rank_tier IN ('S','A')`)
- Backoff: 1 sikertelen → 7 nap, 2 → 30 nap, 3 → never (status='not_available')
- Batch 50/run, concurrency 4
- Idempotens: `episode_transcripts.episode_id` PK
- **Költség: $0** (csak HTTP fetch)

### 4. Cron jobid 41 — `transcript-scout-runner`
Init `*/10`, adaptív (`set_transcript_scout_schedule`).

### 5. Hook → chunking pipeline
Új transcript landol → `embed-chunks-runner` látja (content_hash diff) → automatikusan újrachunkol az új text alapján → meglévő `description`-chunkokat törli azon episode-ra, transcript-chunkokat ír.

---

## Sorrend (egy session)
1. Migration: `episode_chunks` + `episode_transcripts` táblák, RLS, indexek, RPC-k, episodes oszlopok, cron jobok 40/41
2. `embed-chunks-runner` edge function + adaptive RPC
3. `transcript-scout-runner` edge function + adaptive RPC
4. `search-hybrid` integration (chunk score merge, feature flag)
5. Memory frissítés
6. Backfill kick-off (manual invoke 1×)

## Mit NEM csinálunk most
- ❌ ASR / Whisper (nincs pénz, dokumentált)
- ❌ B/C tier scout (csak S/A — később bővíthető)
- ❌ Apple/Spotify (nincs publikus API)
- ❌ Transcript chunking nélkül semantic search-be tolás (a chunking az egyetlen interface)

Akkor most beleugrok a migrációba. Mehet?