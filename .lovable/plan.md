# Search anti-hallucination upgrade — 3 layers

Cél: a globális "vektor pass bármit visszahoz, ami nem releváns" anomália megszüntetése. Három réteg együtt = ~80% lefedés.

---

## 1. Rare-token MUST gate (univerzális szigorítás)

**Mit csinál:** Ha a query bármely tokenje "ritka" a korpuszban (magas IDF), akkor az a token **kötelező** lex match-é válik. Ha nincs olyan epizód ami tartalmazza → no result + sector/entity fallback. Nincs többé "Nbis → Nobel" típusú hallucináció.

**Hol:** `supabase/functions/search-hybrid/index.ts`
- IDF lookup: új RPC `token_idf(tokens text[]) returns table(token text, df bigint)` — `episodes` tábla `search_text` tokenjein document frequency. Cache-elve 1 órára egy `token_df_cache` táblában (admin írás).
- Logika: ha bármely token `df < 200` (≈ 0.03% korpusz) ÉS hossza ≥ 3 → bekerül `required_terms`-be a hybrid RPC-nek (a meglévő MUST gate mechanizmus már megvan).
- Stop-word és ticker szimbólumok kivételek (a ticker ágon már külön MUST gate van).

**Eredmény:** "Aravind Srinivas", "xAI Colossus", "Nbis", "ASTS" stb. queries automatikusan szigorúak — nem kell manuális alias.

---

## 2. Confidence score + soft banner

**Mit csinál:** A találati lista átlagos relevanciáját 0-1 skálán mérjük. Alacsony confidence = "Related episodes about X" banner a "results" helyett. Felhasználó látja, hogy ez nem exact match.

**Hol:**
- `search-hybrid/index.ts`: top-10 átlag `match_confidence = (avg_lex_norm × 0.5) + (entity_match_ratio × 0.3) + (rare_token_coverage × 0.2)`. Response-ba új mező: `confidence: number` és `confidence_band: "high" | "medium" | "low"` (>0.6 / 0.3-0.6 / <0.3).
- `src/pages/SearchPage.tsx`: low band → szürke banner: *"Showing related episodes — no exact matches for "{q}""*. Medium band → diszkrét chip: *"Loose matches"*.

**Eredmény:** Soha nem ígérünk hamis pontosságot. A user dönti el, érdemes-e tovább böngészni.

---

## 3. Entity fallback pyramid (a sector fallback általánosítása)

**Mit csinál:** Az NBIS sector fallback mechanizmust kiterjesztjük minden detektált entitás-típusra, az `entities` táblát használva (LIVE).

**Hol:** `supabase/functions/search-hybrid/index.ts`
- Új helper: `entityFallback(query, understanding)`:
  - **Person query** (intent="person"): ha a person szerepel `entity_profiles`-ban → re-embed `{person_name} {top 3 topics from profile}` és semantic-only pass.
  - **Company query** (intent="company"): re-embed `{company_name} {industry_terms}` (most `MARKET_SYMBOL_SECTORS` + új `COMPANY_SECTORS` map a top ~50 cégre, vagy entity_profile bio-ból kinyert kulcsszavak).
  - **Topic query**: ha van matching `topic_hubs` slug → már működik a /topic route, search-ben csak banner: *"Visit topic page: {hub}"*.
  - **Ticker query**: meglévő sector fallback marad.
- Mindegyik fallback `sector_fallback: true`-val + `fallback_kind: "person" | "company" | "ticker" | "topic"` + `fallback_hint`-tel jelölve.
- `SearchPage.tsx`: banner szöveg dinamikus a `fallback_kind` alapján (pl. *"No exact mentions of Aravind Srinivas — showing related episodes about AI search and Perplexity"*).

**Eredmény:** Bármilyen entity-szerű query-re értelmes fallback, nem random vektor-szomszédok.

---

## Technikai részletek (külön szekció)

**Migration:**
- `token_df_cache(token text PK, df bigint, computed_at timestamptz)` + RLS (admin write, public read) + `compute_token_df(tokens text[])` SECURITY DEFINER függvény ami `unnest(string_to_array(lower(search_text), ' '))` aggregálással számol.
- Opcionális: ha lassú, lazy-fill — első hit cache-eli, utána olcsó.

**Confidence képlet komponensek:**
- `avg_lex_norm`: top-10 lex score / max lex score (0-1)
- `entity_match_ratio`: hány top-10 epizódban szerepel min. 1 detected entity / 10
- `rare_token_coverage`: hány rare token van lefedve top-10-ben / total rare tokens

**Banner UX:**
- High: nincs banner, normál "Results" header.
- Medium: `<Badge variant="outline">Loose matches</Badge>` a header mellett.
- Low: full banner card a lista fölött, halvány bg, info ikon, szöveg + "Try a different query" link.

**Telemetry:** `search_events` tábla `result_count` mellé új `confidence_band` (text). Admin dashboard-on új oszlop a Top queries táblában → később priorizálni tudjuk az alias-okat.

**Backward-compat:** Minden új mező optional a response-ban, a frontend `?? fallback`-kel kezeli.

**Deployment:** 1 migration + `search-hybrid` redeploy + frontend.

**Becsült hatás:**
- Hallucinációk eltüntetése: ~70% (rare-token gate)
- User trust növelés: jelentős (confidence banner)
- Zero-result UX javítás: jelentős (entity fallback pyramid)
