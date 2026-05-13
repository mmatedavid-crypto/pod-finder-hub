# Plan: Út a publikus launch felé

A backlog gyakorlatilag kész (126k/133k friss epizód AI-summary-vel, 6.6k S/A/B/C podcast SEO-val, 7.5k pod embedding, 658k epizód embedding). Innen már nem mennyiségi, hanem **minőségi és go-live** munka van hátra. A terv 4 fázisból áll, kb. 5–7 nap alatt élesedhet.

---

## Fázis 1 — Sprint kivezetése (ma, ~1 óra)

A 48h sprint cron beállításai még "drain" módban futnak, ezeket vissza kell venni steady-state-re, különben fölöslegesen égetjük a Cloud kreditet.

- `seo-enrich-enqueue` cron: `*/5` → `*/15`
- `seo-enrich-runner` fanout: 8 → 4, daily budget: $50 → $5
- `deep-hydrate-runner`: `*/2` → `*/10`
- `embed-episode` cron: `*/1` → adaptív (már az)
- `title-cleanup`: `*/15` → `*/60`
- AI daily budget cap visszavétele $5/day-re
- Memory frissítése (Core rule: "sprint vége, steady state")

## Fázis 2 — Tartalom-minőség audit (1–2 nap)

A site akkor mehet publikba, ha a látogató első 3 kattintása jó élmény. Mintavételes ellenőrzés:

- **Homepage feed**: 30 random epizód kézzel végignézve (cím, summary, kategória, cover) — ha >5% rossz, javítás
- **Top 100 S-tier podcast** AI-summary-jának mintavételes review — nyelv, hossz, hallucináció
- **Kategorizálás**: 21-slug taxonomy újrafuttatása minden S/A podcastra, ha hiányzik
- **Search QA test set** (`mem://qa/search-issues.md`) lefuttatása, regressziók javítása
- **Mood collections**: `mood-collections-seed` újrafuttatás friss embeddingekkel
- **Featured / curated lists**: legalább 5 kézzel kurált "best of" lista a homepage-re

## Fázis 3 — SEO és indexelhetőség (1–2 nap)

A bot-prerender már él. Hátralévő:

- **Sitemap regen**: friss epizódok + új podcastok bekerüljenek
- **`seo_chat--list_findings`** lefuttatás → minden failing finding fix
- **Meta title/description** ellenőrzés a top 200 podcast + 500 epizód oldalon
- **JSON-LD** (Podcast, PodcastEpisode, BreadcrumbList) review
- **`llms.txt`** és `robots.txt` átnézés
- **Core Web Vitals**: homepage + search + podcast detail Lighthouse audit, ha <90, optimalizálás (LCP, CLS)
- **OG image** generálás top 100 podcastra
- **Google Search Console + Bing Webmaster** beadás, sitemap submit

## Fázis 4 — Observability és launch (1 nap)

- **Admin Cron Status oldal** zöld minden soron
- **Edge function error rate** monitoring — ha bármelyik >2%, vizsgálat
- **Search latency p95** <800ms ellenőrzés
- **Incident kill-switch** teszt (`background_jobs.incident_mode = true` → minden async leáll)
- **Privacy / Terms / About** oldalak végleges szöveg
- **Feedback gomb** működik, célzott inbox
- **Soft launch checklist**:
  - Custom domain `podiverzum.com` aktív (már él)
  - Publish Update gomb megnyomva
  - 10 fős privát beta csoport meghívása 24h-ra
  - Beta visszajelzések alapján P0 javítások
- **Public launch**: HN Show / Product Hunt / X poszt

---

## Mérőszámok a launch előtt (go/no-go)

| Mutató | Cél |
|---|---|
| S+A podcast SEO coverage | ≥98% |
| Friss epizód AI-summary coverage (30 nap) | ≥95% (most 95%) |
| Homepage feed kattintható és nem üres | 100% |
| Search top-10 manuális minőség | ≥8/10 random querynél jó |
| Lighthouse Performance (mobile) | ≥85 |
| Cloud daily spend steady state | <$10/day |
| Edge function error rate | <2% |

## Mit nem csinálunk a launch előtt (post-launch backlog)

- Search ranking finomhangolás (memory szerint nem nyúlunk hozzá amíg minden zöld)
- Multilingual / HU rollout (`mem://plans/multilingual.md`)
- Audio transcription, Spotify download
- User accounts / kommentek / fizetés
