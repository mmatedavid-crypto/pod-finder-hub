# Plan — Stop parallel background work, externalize description chunk drain

## Goal
- Pause every non-public-critical background job on podiverzum.com.
- Keep only ONE pipeline active: **description chunk embedding** (190k pending).
- Move the heavy work off Lovable edge runtime to an **external worker** that calls Gemini API directly.
- Fix the slow selector so claim takes <1s.
- Lovable backend exposes only: claim, complete, progress, monitoring.

---

## Part 1 — Snapshot + pause crons

### 1a. Snapshot current cron state
Insert a row into `app_settings` under key `chunk_drain_cron_snapshot_2026_05_19`, containing the full `cron.job` table (jobid, jobname, schedule, active). This is the restore source of truth.

### 1b. Unschedule non-essential jobs
Pause via `cron.unschedule(jobid)`:

| Pause | Job |
|---|---|
| 7 | deep-hydrate |
| 8 | incremental-refresh |
| 10 | title-cleanup |
| 11 | seo-enrich-enqueue |
| 12 | seo-enrich-runner (broken — Gemini 403) |
| 13 | rss-self-healing |
| 16 | rss-hunter |
| 18 | embed-podcast (~99% drained) |
| 19 | formula-c-runner |
| 20 | embed-episode (~99% drained) |
| 22 | mood-collections weekly |
| 23 | search-suggestions daily |
| 24 | category-seo weekly |
| 25 | daily-social-post |
| 27 | ai-feed-scout |
| 28 | pi-dump-process |
| 30 | search-text-safety |
| 32 | episode-dedup |
| 33 | ai-categorize |
| 34 | x-metrics-fetch |
| 36 | mood-pool-refresh |
| 37 | entity-extract-runner |
| 43 | entity-profile-runner |
| 44 | entity-profile-company-runner |
| 45 | embed-description-runner (Lovable runner — replaced by external worker) |

Also set defensive `app_settings.*_controls.enabled = false` flags for paused runners that read them.

### 1c. Keep running (public-critical)
- 4 queue-drainer
- 21 homepage-feed-refresh
- 31 search-cache-cleanup-weekly
- 38 process-email-queue
- Public site, /functions/search-*, sitemap, prerender, smart player, admin — untouched.

Smart Player, autocomplete, search-hybrid, /sitemap, /robots, og-image, geo, etc. are pull-based edge functions (no cron), unaffected.

---

## Part 2 — Fast selector + claim queue (migration)

### Problem
`select_description_chunk_candidates` does:
```
WHERE length(description) > 1600
  AND NOT EXISTS (SELECT 1 FROM episode_chunks WHERE episode_id = e.id AND source='description')
ORDER BY published_at DESC NULLS LAST
LIMIT 80
```
Full seqscan on 288k rows + anti-join → 40s.

### Fix — add status column + partial index + claim queue table

**Migration:**

1. Add status column on `episodes`:
   ```sql
   ALTER TABLE episodes
     ADD COLUMN IF NOT EXISTS desc_chunk_status text,
     ADD COLUMN IF NOT EXISTS desc_chunk_claimed_at timestamptz,
     ADD COLUMN IF NOT EXISTS desc_chunk_claim_id uuid;
   ```
   Values: NULL = unprocessed, `'pending'`, `'claimed'`, `'done'`, `'skipped'`, `'failed'`.

2. Backfill in one shot:
   ```sql
   UPDATE episodes e SET desc_chunk_status='done'
     WHERE EXISTS (SELECT 1 FROM episode_chunks ec
                   WHERE ec.episode_id=e.id AND ec.source='description');
   UPDATE episodes e SET desc_chunk_status='pending'
     WHERE desc_chunk_status IS NULL
       AND description IS NOT NULL
       AND length(description) > 1600;
   ```

3. Partial index for fast claim:
   ```sql
   CREATE INDEX CONCURRENTLY idx_episodes_desc_chunk_pending
     ON episodes (published_at DESC NULLS LAST)
     WHERE desc_chunk_status='pending';
   CREATE INDEX CONCURRENTLY idx_episodes_desc_chunk_claimed
     ON episodes (desc_chunk_claimed_at)
     WHERE desc_chunk_status='claimed';
   ```

4. **Atomic claim RPC** with `FOR UPDATE SKIP LOCKED`:
   ```sql
   CREATE OR REPLACE FUNCTION claim_description_chunk_jobs(_limit int, _worker uuid)
   RETURNS TABLE(id uuid, podcast_id uuid, description text) ...
   -- WITH cte AS (SELECT id FROM episodes WHERE desc_chunk_status='pending'
   --              ORDER BY published_at DESC NULLS LAST LIMIT _limit
   --              FOR UPDATE SKIP LOCKED)
   -- UPDATE episodes SET desc_chunk_status='claimed', desc_chunk_claimed_at=now(),
   --         desc_chunk_claim_id=_worker
   --   FROM cte WHERE episodes.id=cte.id
   --   RETURNING episodes.id, episodes.podcast_id, episodes.description;
   ```

5. **Complete RPC** (called after chunks inserted):
   ```sql
   CREATE OR REPLACE FUNCTION complete_description_chunk_job(_episode_id uuid, _status text)
     -- sets desc_chunk_status to 'done'/'skipped'/'failed', clears claim
   ```

6. **Stale reaper** (5-min stale):
   ```sql
   CREATE OR REPLACE FUNCTION reap_description_chunk_stale_claims()
     -- UPDATE episodes SET desc_chunk_status='pending', desc_chunk_claimed_at=NULL
     --   WHERE desc_chunk_status='claimed' AND desc_chunk_claimed_at < now() - '5 min'::interval;
   ```

7. **Stats RPC** that returns real numbers (never silently zero):
   ```sql
   CREATE OR REPLACE FUNCTION description_chunk_drain_stats()
     RETURNS TABLE(pending bigint, claimed bigint, done bigint, total_desc_chunks bigint, failed bigint, stale_claims bigint)
   ```

All under `public`, SECURITY DEFINER, GRANT EXECUTE to `service_role` only for claim/complete/reap; stats public.

Replace `select_description_chunk_candidates` body to read from the new status column (same signature, so the existing Lovable runner still works if re-enabled — but its cron stays unscheduled).

---

## Part 3 — External worker

Lovable does NOT run the worker. We provide:

- **Edge function `desc-chunk-claim`** (POST) — calls `claim_description_chunk_jobs(limit, worker_uuid)`, returns rows.
- **Edge function `desc-chunk-complete`** (POST) — accepts `{episode_id, chunks: [...], status}`, inserts into `episode_chunks`, calls complete RPC.
- **Edge function `desc-chunk-progress`** (GET) — returns stats from `description_chunk_drain_stats()` + today's spend from `ai_spend_daily`.

All three require a shared secret header `X-Drain-Worker-Key` (new secret `DRAIN_WORKER_KEY`).

Worker (user runs on their own machine / Fly / Render / Cloud Run) — Node/Deno script ~150 lines:
- Loop: claim 50 → embed each chunk via `generativelanguage.googleapis.com/...:embedContent` (model `gemini-embedding-001`, 768d) → POST complete.
- Concurrency 8 episodes, rate-gate 18 req/s.
- Stops when claim returns 0 rows.
- Logs pending, processed/min, errors, $ to console + optional progress endpoint.

I will provide the worker script as a downloadable artifact in `/mnt/documents/desc-chunk-worker.mjs` plus a README.

---

## Part 4 — Admin monitoring

Add a small section to `AdminAiEnrichmentPage` (or wherever runner panels live) showing `description_chunk_drain_stats()` live: pending / claimed / done / stale / chunks written / today's spend.

(Or skip UI; the user can hit `/desc-chunk-progress` directly. Confirm preference.)

---

## Part 5 — Finish + restore

- When pending=0 and claimed=0 → declare done, return final report.
- DO NOT auto-restore paused crons. The snapshot in `app_settings.chunk_drain_cron_snapshot_2026_05_19` is the canonical restore source; restoration is a separate user-approved step.

---

## Order of operations
1. Migration (status column + backfill + indexes + RPCs).
2. Edge functions (claim / complete / progress) + secret.
3. Snapshot crons → unschedule list above.
4. Hand worker script to user → they run it → I monitor via stats.
5. When drained → report → wait for restore approval.

## Open questions before I execute
- **Worker host**: do you want me to (a) hand you a ready-to-run Node script for your local machine / Fly.io, or (b) deploy it as a single long-running Lovable edge invocation despite the 60s cap (NOT recommended), or (c) something else?
- **Admin UI**: add a small live progress panel, or progress JSON endpoint only?
- **Secret name**: OK to use `DRAIN_WORKER_KEY` as the shared bearer?

Once you confirm those three, I'll execute Parts 1–3 in one go.
