## Cél

A keresés minőségét javítani azon az áron, hogy a válaszidő hosszabb lehet. A jelenlegi pipeline több helyen agresszív timeouttal és kis kandidátus-pool-lal dolgozik, hogy p50 ~1s alatt maradjon — emiatt rendszeresen "elhalnak" a minőséget javító lépések (HyDE, Cohere rerank, Gemini rerank, entity resolution, podcast pinning). Ezt a megszorítást lazítjuk.

## Mit változtatok

### 1) Időkorlátok megemelése (`supabase/functions/search-hybrid/index.ts` + shared)
| Lépés | Most | Új |
|---|---|---|
| `understandQuery` (Gemini query understanding) | 1500ms | 3000ms |
| `embed` (query embedding) | 1800ms | 3000ms |
| `resolve_query_entities` (entity profile fuzzy match) | 400ms | 1500ms |
| `match_podcast_by_name` (podcast pin) | 300ms | 1200ms |
| HyDE gen | 1700ms | 3500ms |
| HyDE embed | 1500ms | 2500ms |
| HyDE internal fetch abort | 1500ms | 2500ms |
| Cohere rerank | 1500ms | 3500ms |
| Gemini rerank (LLM) | 7000ms | 12000ms |

### 2) Reranker mélyebbre engedése (több jelölt, jobb sorrend)
- Cohere rerank: `ordered.slice(0, 30)` → `slice(0, 60)`, `match_count` ugyanennyi.
- Cohere küszöb feltételek lazítása: `ordered.length >= 10` → `>= 5`; `confidenceBand` szűrő megszüntetése (low konfidencián is engedjük — pont ott segít a legjobban).
- Gemini rerank a Cohere UTÁN is fusson, ha a query high-precision intent (person/company/ticker) — most a Cohere kizárja. Tandem mód: Cohere fej → Gemini csak a top 20-on újrarendez.
- Chunk-augment pool: `candidate_pool: 400` → `800`, `match_count: 30` → `60`.

### 3) Kandidátus-medence bővítése
- Az alap RPC hívásoknál `limit_n: Math.max(limit, 50)` → `Math.max(limit, 100)` (több jelölt megy be a rerankbe).

### 4) Mi marad változatlan
- Cache (7d understanding, 24h rerank) — gyors a meleg query.
- A keresés UX (NeoSearchBar "thinking" állapota) már most is támogatja a hosszabb várakozást.
- Költségvetés (Cohere napi $2, Gemini napi limit) változatlan — csak per-call timeouts nőnek.
- Suggest/autocomplete (`search-suggest`) NEM változik, az a billentyűleütésre fut, ott a gyorsaság fontos.

## Technikai részletek
- `supabase/functions/_shared/search-understand.ts`: `timeoutMs` default 1500 → 3000.
- `supabase/functions/_shared/search-hyde.ts`: a `withTimeout` hívások + belső `ctrl.abort()` időzítője.
- `supabase/functions/_shared/cohere-rerank.ts`: `setTimeout(() => ctrl.abort(), 1500)` → 3500.
- `supabase/functions/search-hybrid/index.ts`: `embed`, `rerank` factory függvények, a `withTimeout` hívások az entity resolverhez és podcast pinhez, a Cohere-gating feltétel, valamint a Cohere/Gemini rerank tandem mód.

## Várt hatás
- p50 latency ~1s → ~2-3s, p95 ~3s → ~6-8s (a NeoSearchBar "decrypting…" állapota lefedi).
- Több ritka query kap valódi entity-pinnelést, Cohere-rangsort és Gemini magyarázatot.
- Cold-cache lekérdezések minősége érzékelhetően javul; meleg cache nem lassul.

## Mit NEM csinálok
- Nem nyúlok a search UI-hez, suggesthez, vagy a Smart Playerhez.
- Nem módosítok adatbázis sémát, indexet, ranking formulát (Formula C v3 marad).
- Nem emelek napi költségbüdzsét.