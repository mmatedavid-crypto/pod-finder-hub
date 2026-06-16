---
name: Cron audit 2026-06-16 (cost)
description: Harmadik cron frekvencia audit — user $10/nap költés panaszra; üres/felesleges runner-ek visszaszedve
type: constraint
---
User panasz: ~$10/nap Lovable Cloud költés. Audit eredménye → ~500 felesleges edge-hívás/nap megszüntetése.

| jobid | név | előtte | utána | indok |
|---|---|---|---|---|
| 38 | process-email-queue | `*/5` | `0 * * * *` | 288 futás/nap, 0 email küldve 30 napja |
| 4  | queue-drainer | `*/10` | `*/30` | 144 futás/nap, discovery_queue pending=0 |
| 21 | homepage-feed-refresh | `*/30` | `0 * * * *` | 48 futás/nap × ~5s MV refresh, homepage óránként elég |
| 51 | purge-non-en-drain | `*/15` | `*/30` | 446k ep backlog, drain folyik, fele költségen |

Megtartva: jobid 8 incremental-refresh `*/5` (adaptív, 23k podcast overdue), jobid 19/20/28/33 adaptív runnerek (maguk hangolódnak).
Inaktív és AZ IS MARAD: 11, 12 (seo-enrich), 18 (embed-podcast) — 39k ai_enrichment_jobs pending, ne reaktiváld kérés nélkül.

Új háttér-cron alapért: `*/30` vagy óránként. Mielőtt új cront raksz, nézd meg a job_run_details payload-ot és a tényleges work-pendinget.
