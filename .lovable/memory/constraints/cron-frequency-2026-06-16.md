---
name: Cron audit 2026-06-16 (cost) + adaptív v2
description: $10/nap cost audit, majd adaptív self-tune 3 háttér-jobra
type: constraint
---
User panasz: ~$10/nap Cloud költés. Audit + **adaptívvá tétel**.

**v2 (2026-06-16 adaptív)** — pure-SQL self-tuning crons:
| jobid | név | tartomány | gate |
|---|---|---|---|
| 38 | process-email-queue | `0 * * * *` ↔ `*/15` ↔ `*/5` ↔ `* * * * *` | pgmq.q_auth + q_transactional count |
| 4  | queue-drainer | `0 * * * *` ↔ `*/30` ↔ `*/10` | discovery_queue status=pending count |
| 51 | purge-non-en-drain | `0 * * * *` ↔ `*/30` ↔ `*/15` | _purge_non_en_eps + _pods count |

RPC: `set_process_email_queue_schedule`, `set_queue_drainer_schedule`, `set_purge_non_en_schedule` — mind SECURITY DEFINER, allowlist-védett. A cron command végén `WITH _tune AS (SELECT set_X_schedule(n)) SELECT CASE WHEN n>0 THEN net.http_post(...) END FROM _tune` — üres → nincs POST, csak ütemezés-állítás.
**jobid 21 homepage-feed-refresh marad `0 * * * *` fixen** (predictálható MV refresh).

Megtartva: jobid 8 incremental-refresh `*/5` (adaptív, 23k podcast overdue), jobid 19/20/28/33 adaptív runnerek.
Inaktív és AZ IS MARAD: 11, 12 (seo-enrich), 18 (embed-podcast) — 39k ai_enrichment_jobs pending, ne reaktiváld kérés nélkül.

Új háttér-cron alapért: `*/30` vagy óránként. Mielőtt új cront raksz, nézd meg a job_run_details payload-ot és a tényleges work-pendinget.

**v3 COST FREEZE (2026-06-17)** — user reported spend still ~$10/day. Billing breakdown showed main cost is **Cloud compute XL** (~8.38 credits today), not cron/AI. Emergency controls applied:
- `app_settings.background_jobs`: `enabled=false`, `incident_mode=true`.
- `app_settings.ai_budget`: `daily_total_cap_usd=0.25`, all per-job AI caps `0`.
- `app_settings.ai_controls`: `enabled=false`, `max_per_day=0`.
- Cron throttled: jobid 8 + 48 hourly; jobid 7/13/16/19/20/28/32/33/37/45/49/51 every 6h.

To actually remove the ~$10/day base burn, downgrade/resize the Lovable Cloud instance from XL in Backend → Advanced settings → Upgrade instance. Do not restart background jobs until cost is rechecked.
