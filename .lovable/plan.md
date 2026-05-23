# Description Cleanup → Re-embed sprint

Cél: olyan `display_description` (clean text) létrehozása podcasts + episodes szinten, ami nem visz rossz irányba YouTube linkek, sponsor blokkok, social CTA-k miatt. Erre épül minden más (re-embed, chunking, search, SEO). **Minden későbbi lépés erre vár.**

## Fázis A — Description cleanup pipeline (blocker, 1-2 nap)

### A1. Schema
- `podcasts.display_description` (text), `podcasts.description_cleaned_at` (timestamptz), `podcasts.description_cleanup_status` (text: pending/rules_ok/ai_refined/skipped/reverted)
- ugyanez `episodes`-en
- `podcasts.description_cleanup_meta` (jsonb: `{rules_removed_pct, sponsor_block, link_block, social_block, needed_ai, ai_model}`)
- index: `episodes(description_cleanup_status, podcast_id)` partial WHERE status='pending'

### A2. Shared cleanup module (`_shared/description-cleanup.ts`)
Konzervatív regex-stack (mint a title-cleanup), explicit return value mindenhol:
- HTML strip + entity decode (van már: `_shared/`)
- **Sponsor blokkok**: "This episode is brought to you by …", "Sponsors:", "Today's sponsor:" → bekezdés vége; "Promo code", "Use code XYZ for"
- **Social / CTA blokkok**: "Follow us on (Twitter|IG|TikTok|YouTube)…", "Subscribe to our newsletter", "Join us on Patreon/Discord/Substack", "Find us at @handle", "Connect with us:" listák
- **Link blokkok**: önálló `http(s)://…` sorok, "Links mentioned:" / "Show notes:" / "Resources:" szakasz a következő üres sorig
- **Timestamp listák**: `(00:00 …\n01:23 …\n)+`, `[00:00] Intro` minták
- **Email / phone CTA**: `Contact: …@…`, "Email us at"
- **Trailing podcast self-promo**: ismétlődő show-név footer
- **Safety guard**: ha eredmény < 30% az eredetinek VAGY < 50 char → `reverted`, raw marad
- **needs_ai flag**: ha cleanup után még tartalmaz `http`, `patreon`, `sponsor`, `subscribe`, `@username` mintát ÉS S/A tier → AI fallback jelölés

Return: `{ display, changed, removedPct, needsAi, reasons[] }`

### A3. `description-cleanup-runner` edge function
- Claim batch (`SELECT … FOR UPDATE SKIP LOCKED`), drain-loop pattern (mint embed-runner)
- Rules futtatás → ha `needsAi && tier IN ('S','A')` → gemini-3.1-flash-lite-preview egyszerű prompt ("Remove sponsor blocks, social/subscribe CTAs, link lists, timestamp lists. Keep the actual episode content description. Return ONLY the cleaned text.")
- **Egyszeri AI budget cap**: `$20 össz` az S/A backfillre, $5/day soft cap a runner-en (preflight)
- B/C tier rules-only, AI fallback skip
- Upsert `display_description` + meta
- Adaptive cron RPC `set_description_cleanup_schedule` (allowlist `*`, `*/2`, `*/5`, `*/15`, `*/30`)

### A4. Új episode-ok: triggert vagy ingest-hookot adunk a `fetch-rss`-re — új epizód érkezésekor rögtön rules-cleanup fut inline (gyors, $0). Ha S/A és needsAi → enqueue a runner-nek.

### A5. Frontend
- Mindenhol ahol `episode.description`/`podcast.description` jelenik meg public oldalon → `display_description ?? description` (EpisodeDetail, PodcastDetail, og-image, feed-xml). Komponens-szinten egysoros change.

---

## Fázis B — Selective re-embed (blocker után indul)

### B1. Embed hash változtatás
- `_shared/embed-text-hash.ts`: source = `display_title || display_description ?? description || summary` (nem cleaner_version, mert az retrigger stampede-et okozna). A `display_description` jelenléte triggereli az új hash-t, csak ott ahol tényleg változott a clean text.

### B2. `select_reembed_candidates` RPC
- Episode: `embedding != null AND description_cleanup_status = 'ai_refined' OR rules_ok AND removedPct > 15`
- Order: tier (S→A→B→C), then last published_at DESC
- Külön slot a podcasts-en

### B3. Drip az `embed-episode-runner`-en
- Második prioritás-band: új epizódok > re-embed > backlog
- Külön $1/day soft cap re-embed-re (a meglévő $3/day-en belül)

### B4. Watchdog gate
- Pipeline watchdog: ha `description_cleanup_status='pending' AND tier IN ('S','A')` arány > 50% → embed runner skip (warn Telegram).

---

## Fázis C — Chunks csak clean textből

### C1. `embed-chunks-runner`: jelenleg `transcript_text` alapú (transcript-scout disabled mióta). Mai logika marad **de** a description-chunking (`desc-chunk-backfill`, jobid 45) source-a `description` helyett `display_description ?? description`-re vált.
### C2. Chunk re-embed: csak ott ahol `chunks_source_hash` változott (clean text miatt).

---

## Mit NEM csinálunk most
- Transcript / YT / STT: HARD BAN marad
- `description` raw oszlop NEM törlődik (eredeti megmarad audit/diagnose okból)
- AI cleanup B/C tier-en nem fut (csak rules)

---

## Becsült költség
- Rules-only: $0
- AI fallback S/A tier (~2-5k ep, ~150 input + 100 output tokens, $0.00010/1k in + $0.00040/1k out flash-lite): **~$5-15 egyszeri**
- Re-embed S/A (~20-50k ep × 768d gemini-embedding-001 $0.000025/1k tokens, ~300 tokens/ep): **~$0.4-1 egyszeri**
- Re-embed B/C: szétkenve $3/day budgeten belül, lassan
- Description-cleanup runner napi: <$1/day steady state

## Becsült futási idő
- Rules cleanup teljes katalógus (~600k ep): **2-6 óra** drain-loop mellett
- AI fallback S/A: **6-24 óra** $5/day cap miatt (vagy gyorsabb ha emeljük az AI cap-et)
- S/A re-embed: **1-2 nap** ($3/day cap, ~50k ep × ~300 token)

## Sorrend végrehajtásra
1. Migration (A1)
2. Shared module (A2) + unit test
3. Runner (A3) + cron
4. Frontend swap (A5)
5. Rules-drain a teljes katalóguson
6. AI fallback drain S/A-ra
7. **Smoke check**: 20 random S-tier episode → eredmény átnézés
8. Re-embed B1+B2+B3
9. Chunks pipeline átállítás (C1)
10. Memory frissítés + watchdog hookok
