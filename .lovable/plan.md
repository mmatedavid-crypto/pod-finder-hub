## Search Quality v12 — Best-in-class push

Skip #1 (click feedback) — `episode_events` még nem gyűjtött elég adatot. Visszatérünk ~2 hét múlva.

Ship #2 + #3 + #4 + #5. Sorrend = növekvő kockázat, mindegyik fallback-barát.

---

### Layer A — Intent-driven freshness decay (#2)

**Cél:** Friss hírek előre, evergreen tartalom változatlan.

**Hol:** `search_episodes_hybrid` RPC (új migration).

**Logika:** új paraméter `p_decay_lambda float default 0`. Score-hoz hozzáad:
```
+ p_decay_lambda * exp(-0.02 * EXTRACT(days FROM now() - published_at))
```
- `intent ∈ {news, company, ticker}` → λ = 0.15
- `intent ∈ {evergreen, topic, person}` → λ = 0 (jelenlegi viselkedés)
- default = 0 (fallback-safe)

`search-hybrid/index.ts`-ben az understanding.intent alapján állítjuk.

**Kockázat:** Zero. Ha intent=topic (default), semmi nem változik.

---

### Layer B — Bigram entity MUST gate (#3)

**Cél:** "Joe Rogan" query soha ne hozzon olyan epizódot, ahol csak "Joe" vagy csak "Rogan" szerepel külön.

**Hol:** `search-hybrid/index.ts`, a meglévő `phrase_terms` boost mellé.

**Logika:** Ha `understanding.intent === "person"` ÉS a query bigramja egyezik egy detektált entitással (entities[] tartalmazza a teljes bigramot) → a bigram bekerül `required_terms`-be (MUST gate). Ha 0 hit → entity fallback pyramid kapja el (már működik).

**Kockázat:** Alacsony. Csak person intent-nél aktív. Fallback létezik.

---

### Layer C — HyDE query expansion (#5)

**Cél:** Konceptuális query-k ("how to grow a SaaS startup") jobb semantic recall.

**Hol:** új edge function `search-hyde` (de inline a search-hybrid-be hívva), VAGY inline `_shared/search-hyde.ts`.

**Logika:**
1. Cache check: `search_hyde_cache(query_norm PK, hyde_text, embedding vector(768), created_at)`. TTL 7 nap.
2. Cache miss → Lovable AI Gateway, model `google/gemini-2.5-flash-lite`, prompt: *"Write a single 2-sentence hypothetical podcast episode description that would perfectly answer this query: {q}. No preamble."* Timeout 1500ms, circuit breaker reuse.
3. Embed a HyDE szöveget (`google/gemini-embedding-001`, 768d).
4. Hybrid search-be két query embedding megy:
   - `original_emb` (jelenlegi)
   - `hyde_emb` (új, súly 0.4)
5. Vector pass: `0.6 * cosine(orig) + 0.4 * cosine(hyde)`.

**Mikor:** Csak ha `intent ∈ {topic, question}` ÉS query length > 3 token. Person/ticker/company query-knél kihagyva (ott entity pinning erősebb).

**Kockázat:** Közepes. Latency +200-400ms cache miss esetén. Cache hit ~5ms. Cache hiánya esetén fallback az eredeti embedding.

---

### Layer D — Cross-encoder reranker (#4)

**Cél:** Top-30 → top-10 finomhangolás cross-encoder modellel. NDCG@10 +15-20pp.

**Provider választás:**
- **Cohere Rerank API** (`rerank-v3.5`) — $2/1000 search, ~150ms p50, legjobb minőség. Új secret: `COHERE_API_KEY`.
- Alternatíva: Lovable AI Gateway nem támogat dedicated rerank endpoint-ot, így Cohere a praktikus út.

**Hol:** `search-hybrid/index.ts`, a meglévő MMR diversity előtt.

**Logika:**
1. Top-30 candidate-et (most top-10-et adunk vissza, kibővítjük 30-ra a hybrid RPC-ben).
2. Cohere rerank hívás: query + 30 episode_text (title + show_notes első 500 char).
3. Új sorrend → top-10. Az MMR diversity utána fut a re-rankelt listán.
4. Circuit breaker: 3 fail / 60s → cooldown 60s, közben sima hybrid sorrend.
5. Budget guard: napi $2 cap (`app_settings.cohere_rerank_daily_spent` counter, reset éjfélkor). Cap elérve → skip rerank.

**Mikor:** Csak ha confidence_band ∈ {medium, high} ÉS top-30 hit count ≥ 10. Low confidence vagy <10 hit esetén nincs értelme.

**Kockázat:** Közepes-magas. Külső függés (Cohere). Latency +150-200ms. Mitigation: circuit breaker + daily cap + skip-on-fail.

---

### Migrations

1. `search_episodes_hybrid` RPC új paraméter `p_decay_lambda`.
2. Új tábla `search_hyde_cache(query_norm text PK, hyde_text text, embedding vector(768), created_at timestamptz)`. RLS: public read, service write. HNSW index nem kell (lookup PK-n).
3. Új `app_settings` kulcs `cohere_rerank_daily_spent` JSON `{date, spent_cents}`.

### Secrets needed

- **`COHERE_API_KEY`** — User add-secret hívás kell. Layer D blokkolva amíg meg nincs.

### Deployment sorrend

1. Migration (decay param + hyde cache + cohere counter).
2. `search-hybrid` redeploy (#2 + #3 + #5 inline).
3. User adds `COHERE_API_KEY` secret.
4. `search-hybrid` redeploy (#4 reranker bekapcsolva).

### Backward compat

Minden új mező optional. Ha bármelyik réteg kiesik (cohere down, hyde timeout, gemini circuit breaker open), a v11 baseline pipeline futáson marad.

### Testing

Smoke test queries (a meglévő admin NDCG dashboard méri majd):
- "Joe Rogan" → person+bigram MUST → exact matches only
- "AI agents" → topic+HyDE → tágabb semantic recall + rerank
- "ASTS earnings" → ticker+freshness decay → friss tartalom előre
- "huberma" → spell correction (v11) → továbbra is működik
- "react hooks tutorial" → topic+HyDE+rerank → mély hit
