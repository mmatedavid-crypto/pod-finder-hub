---
name: Cron frequency caps (2026-06-12)
description: Második cron frekvencia csökkentési kör — process-email-queue, social, homepage, watchdog, refresh, hydration, pi-dump
type: constraint
---
Második cron audit (2026-06-12). ~17,000 felesleges edge-hívás/nap megszüntetése.

| jobid | név | előtte | utána | indok |
|---|---|---|---|---|
| 38 | process-email-queue | `5 seconds` | `*/5 * * * *` | 17,227 futás/nap, összesen 4 email küldve valaha, utolsó 2026-05-13 |
| 25 | daily-social-post | `*/30 * * * *` | `0 14 * * *` | memory szerint napi 1× 14:00 UTC |
| 21 | homepage-feed-refresh | `*/5 * * * *` | `*/30 * * * *` | homepage MV ritkán változik |
| 48 | pipeline-watchdog-5m | `*/5 * * * *` | `*/10 * * * *` | monitoring, 10p elég |
| 8 | incremental-refresh | `*/5 * * * *` | `*/10 * * * *` | igazítás jobname-hez |
| 7 | deep-hydration | `*/10 * * * *` | `*/30 * * * *` | igazítás jobname-hez |
| 28 | pi-dump-process | `*/30 * * * *` | `0 * * * *` | adaptív self-tune visszaszedi ha pending van |

Új háttér-cron alapértelmezett: `*/15` vagy óránként. Sub-minute cron TILOS, mindig nézd meg a job_run_details-t mielőtt új gyakori cront raksz be.
