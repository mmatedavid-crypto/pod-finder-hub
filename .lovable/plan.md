# Neo v2 — search-asszisztens, nem chatbot

## Cél
Neo 95%-ban láthatatlan. Csak akkor jelenik meg, ha tényleg segíthet, és akkor sem kérdést tesz fel, hanem **kattintható chipeket** kínál, amik **garantáltan találatra vezetnek** (a top-50 valós eredményből aggregálva).

## 1) Trigger gate (700k epizódhoz hangolva)

Szerver oldali `should_surface` logika a `search-refine`-ban. Neo CSAK akkor aktív, ha **bármelyik** igaz:

- **A) Zero-hit**: `strictHitCount === 0` ÉS van vektoros fallback eredmény → "closest match" mód (#6)
- **B) Wide ambiguity**: query ≤2 szó ÉS `totalHits ≥ 200` ÉS top-10 ≥3 különböző `podcasts.category_primary`-ban ÉS legalább 2 olyan entity (person/company/topic) van, ami top-10-ből 2+ epizódban szerepel
- **C) Single-word ticker/acronym**: query 1 szó, 2-5 betű, csupa nagybetű VAGY az `understanding.intent === "ticker"`

**Soha**: `q.split(/\s+/).length ≥ 4`, idézőjeles query, `totalHits < 10`, vagy ha user már refinementet adott (ezt session-storage-ben tartjuk: `neo:refined:{qHash}`).

## 2) Verified disambiguation chips (#2 + #4 ötvözve)

A `search-refine` már nem szabad szöveges javaslatokat generál, hanem a **top-50 valós találatból** aggregál chipeket. Minden chipnek van `resultCount`-ja; csak `≥3 hit` chipek jelennek meg.

3 chip-típus, fontosság sorrendben:
1. **Entity chip** — `top entity from results` (pl. `[🐆 jaguar (animal)] [🚗 jaguar (car)] [🏈 jaguars (NFL)]`) — entity a `episodes.people/companies/topics`-ból, count alapján
2. **Podcast chip** — ha 1 podcast >40%-át adja a találatoknak, NEM mutatjuk (már így is dominál); ha 3+ podcast hasonló súllyal van, mutatjuk: `[Lex Fridman (12)] [Huberman Lab (8)]`
3. **Recency chip** — csak ha a találatok időben szétszórtak: `[last 30 days (5)] [2024 (12)]`

Max 3 chip összesen. Mindegyik kattintásra **új keresést indít**, ami már a chip megfelelő szűrőjével/kontextusával fut (`q + " " + entityName` vagy `?podcast=slug` filter).

Mivel a chipek a tényleges top-50-ből jönnek, **minden chipnek van valós találata** → eltünteti a "kattint, nincs eredmény" problémát (#4).

## 3) Silent mode (#3)

Az auto-typewriter helyett:

- **Default**: Neo nem szakítja meg a flow-t. A search bar mellett egy diszkrét pulzáló `▸ neo (3)` badge jelenik meg (a 3 = ajánlott chipek száma).
- **Klikk a badge-re** → kinyílik a chip-sor + 1 mondatos magyarázat (typewriter csak ekkor).
- **2x bezárás 1 session-ben** → 24h-ig nem jelenik meg semmi (`sessionStorage.neo:muted`).
- **Auto-open kivétel**: zero-hit esetnél (A trigger) auto-megjelenik, mert ott a user elakadt.

## 6) Closest-match mód

Zero-hit esetén Neo egy mondatban közli a vektoros fallback eredmény fő témáját, és chipeket kínál a kapcsolódó valós entitásokra. Pl.:
> `"AST SpaceMobile" → no exact hit. closest: satellite communications.`
> `[satellite tech] [Elon Musk] [SpaceX]`

## Architektúra változások

### Backend
- **`search-refine/index.ts`** — átírás:
  - Új input: `topResults` mostantól tartalmazza `people, companies, topics, categoryPrimary, publishedAt, podcastSlug` mezőket is
  - Új input: `strictHitCount, totalHits, understanding.intent`
  - Output: `{ mode: "off" | "ambiguity" | "zero_hit", message: string, chips: [{label, query, count, kind}] }`
  - LLM csak a 1-mondatos `message`-et generálja (és csak `mode !== "off"` esetén); a chipek **kódból** jönnek a top-50 aggregációból
  - Cache marad

### Frontend
- **`SearchPage.tsx`** — `topResults`-be belerakjuk az entity mezőket; a `search-refine` válaszát új formátumban kezeljük; chip-kattintás új query-t indít (sessionStorage-be `neo:refined:{qHash}=1`)
- **`NeoSearchBar.tsx`** — új state: `silent` (badge mód) vs `expanded` (chipek + message). Default `silent`, kivéve zero-hit. Bezáráskor `neo:closeCount++`; ha 2 → `neo:muted` 24h
- **Új komponens**: `<NeoChips />` — a 3 kattintható chip render

### Új helper
- **`supabase/functions/_shared/neo-chips.ts`** — `aggregateChips(topResults, totalHits): Chip[]` — entity/podcast/recency aggregáció + count szűrés

## Mit NEM csinálunk most
- Telemetria (#7) — külön sprint
- Hero search bar — érintetlen
- Multi-turn — érintetlen, továbbra is 1 turn

## Sikerkritérium
- "podcast" (1 szó, 700k+ találat) → Neo silent badge entity-chipekkel (top topics)
- "Lex Fridman AI safety 2024" (4 szó) → Neo nem jelenik meg
- "AST SpaceMobile" zero-hit → Neo auto-megjelenik closest-match módban
- Minden chip-kattintás >0 találatot ad
- 2x bezárás után 24h-ig csend