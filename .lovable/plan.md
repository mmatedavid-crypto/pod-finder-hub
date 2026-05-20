
# Podiverzum.com — AI/data pipeline audit & safe-restore plan

Mindent felmértem, semmit nem indítottam el. A jelenlegi állapot már nagyrészt a kért „csak inkrementális" profilban van (a nehéz backlog jobok auto-paused, vagy szándékosan le vannak állítva). **Egy darab tényleges produkciós törés van**: az `embed-episode-runner` és `embed-podcast-runner` 2026-05-20-tól „API Key not found"-dal hal el (a `GEMINI_API_KEY` secret eltűnt vagy lejárt a Supabase Edge runtime-on, miközben a sandboxban még megvan). Ezen kívül a teljes `ai_call_audit` rendszer, amit kérsz, **nem létezik** — külön build kell hozzá.

---

## A. Jelenlegi pipeline-coverage tábla

| Job / runner | Állapot | Backlog | Modell | Provider | Heti tényköltség | Cél |
|---|---|---|---|---|---|---|
| `incremental-refresh` (RSS pull) | ✅ aktív, `*/5 *` | due=17 282 | — | — | $0 | kritikus, új epizódok |
| `queue-drainer` | ✅ aktív, 10p | 0 | — | — | $0 | kritikus |
| `deep-hydrate-runner` | ✅ aktív, `*/5 *` | pending=11 550 | — | — | $0 | hidratálás |
| `rss-hunter` | ✅ aktív, `*/30` | due=1 569 | — | — | $0 | feed self-healing |
| `seo-enrich-runner` (epizód/podcast SEO+entity) | ⛔ **auto-paused 05-17** „daily_budget_reached" | 47 622 pending | `gemini-3.1-flash-lite-preview` (Gateway-only) | Lovable Gateway | $0 most | enrichment |
| `seo-enrich-enqueue` (jobid 11) | ✅ `*/15` (de runner pause-olva → halmozza a queue-t) | — | — | — | $0 | sorbarakás |
| `categorize-podcast-runner` | ✅ aktív, adaptív | folyamatos | `gemini-2.5-flash` | Gateway | $0 ma | kategorizálás |
| `embed-podcast-runner` (jobid 18) | ⚠️ **TÖRVE** 05-20 óta `INVALID_ARGUMENT: API Key not found` | pending=0, de új változások nem futnak le | `gemini-embedding-001` direct | Tier 1 → meghal | $0 ma | embedding |
| `embed-episode-runner` (jobid 20) | ⚠️ **TÖRVE** 05-20 óta ugyanaz | 219 729 pending (új epizódok!) | `gemini-embedding-001` direct | Tier 1 → meghal | $0.002 ma (569 sikerült) | embedding |
| `embed-description-runner` (jobid 45) | ✅ aktív, de minden run duplicate-key violation | 0 epizód halad | `gemini-embedding-001` | Tier 1 | $0.05 ma | leíró-chunk |
| `embed-chunks-runner` | ⛔ szándékos pause `description_backfill_priority` | 0 | — | — | $0 | chunk |
| `transcript-scout-runner` | ⛔ szándékos pause | 574 failed | — | — | $0 | optional |
| `yt-backfill-runner` | ⛔ szándékos pause | 1 403 902 pending | — | — | $0 | optional |
| `tiktok-generate` | ⛔ szándékos pause | — | — | — | $0 | social |
| `daily-social-post` | ✅ 14:00 UTC | — | `gemini-2.5-flash` | Gateway | ~$0.01/nap | social |
| `formula-c-runner` (ranking) | ✅ fut | mismatch=0 | — | — | $0 | ranking |
| `title-cleanup-runner` | ✅ óránként | 1 240 324 | regex (nem AI) | — | $0 | tisztítás |
| `pi-dump-process` | ✅ adaptív | — | — | — | $0 | felfedezés |
| `ai-feed-scout` (4h) | ✅ | — | Gemini + Firecrawl | Gateway | kis | felfedezés |
| `search-suggest` / `search-answer` / `search-chat` / `search-refine` / HyDE | ✅ frontend on-demand | n/a | Gateway gemini-2.5-flash + Tier 1 HyDE | mixed | $0.01/nap | user-facing search |

**Tegnapi teljes AI-költés: $0.62. Trend: $5/nap → $0.5/nap (backlog ledolgozva).**

---

## B. Két produkciós tűz, amit AZONNAL javítani kell (csak ezeket szeretném végrehajtani jóváhagyással)

### B1. `GEMINI_API_KEY` újra-kiosztás az Edge runtime-ra
- Az env-listában még szerepel, de az `embed-episode-runner`/`embed-podcast-runner` 05-20-tól folyamatosan `API Key not found`-dal száll el.
- Fix: `secrets--update_secret(["GEMINI_API_KEY"])` — te kapod a biztonságos formot, beírod a Tier 1 kulcsot. Semmi kódváltozás. Utána egy `embed-episode-runner` curl tesztrun.

### B2. `embed-description-runner` duplicate-key bug
- Minden run elhasal `episode_chunks_episode_id_source_chunk_idx_key`-en, mert ugyanazt az epizódot újrafeldolgozza source-hash ellenőrzés nélkül.
- Fix: az upsert `onConflict: 'episode_id,source,chunk_idx'`-szel kell, vagy a kiválasztásnál ki kell zárni a már feldolgozottakat (`chunks_updated_at IS NULL OR chunks_source_hash != current_hash`). 1 fájl, ~15 sor.

Ez a kettő helyreállítja az új-tartalom embedding flow-t. Több inkrementális javítás nem kell — minden más „incremental-only" sín már fut.

---

## C. Amit a kérésednek megfelelően **NEM** indítok újra

| Job | Miért marad pause-on |
|---|---|
| `embed-chunks-runner` | kifejezetten tiltottad, plusz a leíró-chunk gate még nem tiszta |
| `transcript-scout-runner` | nagy backlog, STT költségbecslés nélkül |
| `yt-backfill-runner` | 1.4M backlog, YouTube kvóta |
| `tiktok-generate` | egyértelmű pause |
| `seo-enrich-runner` újra-engedélyezése **régi** epizódokra | csak új epizódokra szabad — lásd D |
| Bármi „re-process all" SEO/embedding/entity | tiltottad |
| `growth_autopilot` (utolsó tick 05-08, 500-as hibával) | félbehagyott kísérlet, hagyom |
| Wikipedia/Wikidata bio runnerek | nem szerepel, nincs cron |

---

## D. Új-tartalom-only enrichment (csak ha B1 után jóváhagyod)

`seo-enrich-runner` újraengedélyezése **csak új epizódokra** úgy biztonságos, ha:
1. `ai_seo_controls.enabled = true`, `daily_budget_usd = 3`, `min_rank = 6`
2. `seo-enrich-enqueue` szűkítése: csak olyan epizódra, ahol `episodes.published_at > now() - interval '14 days'` és `ai_enriched_at IS NULL`
3. Modell **változatlan**: `gemini-3.1-flash-lite-preview` — ez **Gateway-only** (a `directModelName()` mappingunk preview-t nem támogat). Ha kötelezően Tier 1 kell, váltani kell `gemini-2.5-flash-lite`-re; ez kódváltás + prompt-regresszió-rizikó.

**Kérdés feléd**: vágjunk `2.5-flash-lite`-re Tier 1-en (olcsóbb, illeszkedik a policy-dhoz, kis minőség-rizikó), vagy maradjon `3.1-flash-lite-preview` Gateway-en (status quo, drágább credit)?

---

## E. `ai_call_audit` — **nem létezik**, kb. fél napos munka

Új tábla + minden AI-érintett edge function instrumentálása:

```sql
CREATE TABLE public.ai_call_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  job_type text NOT NULL,
  provider text NOT NULL,           -- 'google_generative_language' | 'lovable_gateway'
  key_source text NOT NULL,          -- 'tier1' | 'gateway'
  model_used text NOT NULL,
  input_tokens int, output_tokens int,
  estimated_cost_usd numeric(10,6),
  prompt_version text, source_hash text, confidence numeric,
  status text NOT NULL,              -- 'ok' | 'error' | 'skipped'
  skipped_reason text, error_message text,
  latency_ms int,
  target_type text, target_id uuid
);
CREATE INDEX ON ai_call_audit (created_at DESC);
CREATE INDEX ON ai_call_audit (job_type, status, created_at DESC);
```

Plusz egy közös `_shared/ai-audit.ts` helper (logCall / logSkipped) és minden runner update-je (~10 fájl). Ezt **külön kérésre** vállalom — most nem írom, mert a B1+B2 megoldja a tényleges törést, ez pedig nagyobb refaktor és átfutási költsége van.

---

## F. Input-validation skip-rules (új; szintén E része)

A `_shared/ai-audit.ts`-be kerülne egy `shouldSkip(input, opts)` ami visszaad `{skip, reason}`-t a következőkre: üres/whitespace, < min_chars, csak URL/HTML/emoji/timestamp regex, `undefined`/`null`/`[object Object]` jelenléte a promptban, source_hash változatlan + létezik output, language-gate fail, kötelező mezők hiányoznak, duplikált sikeres job. Minden skip audit row-t ír.

---

## G. Költségkorlátok — már nagyrészt megvannak

- `daily_budget_usd` minden runner-ben (seo $3, entity $10, embed $0.5/$20/$10/$5, categorize $20)
- globális kill-switch: `app_settings.background_jobs.incident_mode` (működik)
- per-run batch+concurrency-cap minden runnerben
- ami **hiányzik**: globális `daily_total_cap` (most csak per-job), és „stop on Pro/Gemini-3 model in payload" guard. E-vel együtt szállítható.

---

## H. Search AI — már működik, csak ellenőrzés

`search-hybrid` deterministic entity-gate + IDF MUST-token már él (memory note); `search-answer` és `search-chat` csak a kiválasztott találatokra prompt-ol — nincs hallucinációs réteg. Ezeken nem nyúlok.

---

## I. Cron-cadence — már konzervatív, NEM nyúlok hozzá

A jelenlegi adaptív schedulerek `set_*_schedule` RPC-ken keresztül auto-tune-olnak; a frissen pinned értékek (`incremental-refresh */5`, `deep-hydrate */5`, `embed-episode * * * * *` ami magas, lásd lent) megfelelnek. **Egy javaslat**: `embed-episode-runner` cron `* * * * *` percenkénti — amíg a kulcs törve van, ez 5 000 hibát/run gyárt. Amíg B1 nincs meg, **érdemes `*/10`-re visszavenni** (egy `set_embed_episode_schedule('*/10 * * * *')` RPC hívás). Engedélyezed?

---

## J. Mit fogok ténylegesen csinálni, ha jóváhagyod ezt a tervet

1. `set_embed_episode_schedule('*/10 * * * *')` — azonnali hibaspam-csökkentés.
2. `secrets--update_secret(["GEMINI_API_KEY"])` — te beírod a Tier 1 kulcsot.
3. `embed-description-runner` upsert/where fix (1 fájl).
4. Egy curl-tesz `embed-episode-runner`-en a kulcs után, hogy lássuk visszaáll.

Mindent, amit fent **E/F/G**-ben/D-ben javaslok (audit-tábla, validáció, SEO új-content-only re-enable, modellváltás), **külön kéréssel** indítom — egy menetben túl nagy és túl rizikós batch lenne.

---

## K. Hátralévő backlogok (rangsorolva, **NEM** indítjuk őket)

| Backlog | Közelség 100%-hoz | Megj. |
|---|---|---|
| Podcast embedding | ~99% (eligible 30 812 / embedded 30 989) | csak az új változások futnának, ha B1 megvan |
| Episode embedding | ~88% (1 710 288 / 1 930 017, pending 219k) | rengeteg új epizód halmozódott; B1 után természetesen ledolgozza |
| Description chunks | ~99% (pending=0, csak duplicate-key zaj) | B2 után tiszta |
| Episode chunks | nem mérhető (paused) | gate kell |
| SEO enrichment | ~93% (924k done / 1.05M total job, 47k pending) | csak új epizódokra |
| YouTube backfill | <1% (53 / 1.4M) | tiltva, drága |
| Transcript scout | ~52% (620 processed, 574 failed) | tiltva |
| AI categorize | folyamatos | OK |

**Kérlek hagyd jóvá ezt a tervet** (vagy szólj, melyik részt szűkítsem/bővítsem) — utána végrehajtom a J.1–J.4 lépéseket.
