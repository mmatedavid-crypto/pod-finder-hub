# "Neo moment" — konverzációs kereső sáv (Fázis 1 MVP)

## Cél
A találati oldal kereső sávja "életre kel" Matrix-stílusban: ~600ms után a user query halkan eltűnik, és typewriter effekttel megjelenik az AI tisztázó kérdése a klasszikus Matrix-zöld monospace fontban. A user vagy válaszol (Enter → új keresés a kontextussal), vagy [✕] gombbal kilép és új keresést indít.

## Vizuális direktíva
- **Szín:** Matrix terminal green `hsl(120 100% 50%)` (fényes), másodlagos `hsl(120 100% 35%)` glow
- **Font:** monospace stack — `"Courier New", "VT323", monospace` (a Matrix valódi `Matrix Code NFI` font védett, a Courier New a leggyakrabban használt helyettesítő a film promo anyagokban és a fan recreation-ökön)
- **Effekt:** halvány CRT glow text-shadow, blokk-kurzor villog `▮`, typewriter ~45ms/char
- **Search bar:** AI módban a border green glow-ot kap (box-shadow), input szöveg színe zöld+monospace, user válasz szintén zöldben
- **Reduced motion:** instant megjelenés typewriter helyett

## Hatáskör (csak Fázis 1)
- **Csak a `/search` oldal sávja** — a hero search a főoldalon nem érintett
- **Egy turn** csak (kérdés → válasz → új keresés). Multi-turn későbbi fázis.
- **Nem minden keresésnél trigger** — szerver dönti, csak ha érdemes (lásd lent)

## Architektúra

### 1. Új edge function: `search-refine`
- Input: `{ q, topResults: [{title, podcast, summary}…6db] }`
- LLM (gemini-3-flash-preview, low temp) eldönti egyetlen tool-call-lal:
  - `should_clarify: boolean`
  - `question: string` (max 90 char, EN) — pl. *"Did you mean the 1977 Woody Allen film, or someone else?"*
  - `suggested_refinements: string[2-3]` — chip-ek a kérdés alá (opcionális megjelenítés)
- Cache: `search_query_cache.refine` jsonb mező (új migration)
- Trigger heurisztika a függvényen belül (nem a kliens dönt):
  - >15 találat ÉS top-3 podcast különböző kategóriából
  - VAGY a query rövid (≤2 szó) ÉS sok találat
  - Minden más esetben `should_clarify=false`, kliens nem mutat semmit

### 2. Frontend state machine `SearchPage.tsx`-ben
```
idle → searching → results-shown
                      ↓ (refine kész + should_clarify)
                  ai-awakening (600ms delay, glow pulse)
                      ↓
                  ai-typing (typewriter)
                      ↓
                  ai-asking (várja user input)
                      ↓
                  user-replying (user gépel)
                      ↓ Enter
                  searching (új query: "{originalQ} — {userReply}")
                      VAGY [✕] → idle (URL q törölve)
```

### 3. Új komponens: `<NeoSearchBar />`
A jelenlegi `<form>` blokk (293-304. sor) helyett egy wrapper komponens:
- props: `value, onChange, onSubmit, aiQuestion?, onExitAI`
- belső state: `mode`, `displayedChars` (typewriter haladás)
- AI módban: input read-only az AI kérdés tartására, de **focusable** és typeable amint elkészül a kérdés (átvált `user-replying` módba)
- [✕] gomb csak AI módban látszik

### 4. Új CSS osztályok `index.css`-ben
- `.matrix-text` — green color, text-shadow glow, monospace
- `.matrix-glow` — box-shadow ring
- `.matrix-cursor` — `::after` blokk-kurzor blink animation
- Új keyframe: `matrix-flicker` (subtle CRT)

## Fájlváltozások
- **Új:** `supabase/functions/search-refine/index.ts`
- **Új:** `src/components/NeoSearchBar.tsx`
- **Edit:** `src/pages/SearchPage.tsx` — state machine, `search-refine` invoke a results betöltése után, NeoSearchBar használata
- **Edit:** `src/index.css` — Matrix utility classes + keyframes
- **Migration:** `ALTER TABLE search_query_cache ADD COLUMN refine jsonb;`
- **Memory update:** `mem://ideas/conversational-search.md` → `mem://features/conversational-search.md` (LIVE state)

## Költségbecslés
- ~$0.0003 / refine hívás (gemini-3-flash-preview, ~400 in / 80 out tokens)
- Csak ~20-30%-ban fut a heurisztika miatt
- Cache hit ratio várhatóan magas (search_query_cache már létezik)
- Becsült napi extra: <$0.20 a jelenlegi forgalom mellett — bőven a $5 budgetben

## Mit NEM csinálunk Fázis 1-ben
- Multi-turn (csak 1 follow-up)
- Suggested refinement chip-ek vizuális megjelenítése (csak data-ban tartjuk)
- Audio "blip"
- Hero search bar konverzió
- Session perzisztencia (csak in-memory)
- A11y `prefers-reduced-motion` még ebben benne van — a typewriter-t kihagyjuk, de a glow-t megtartjuk

## Sikerkritérium
- "Annie Hall" keresésnél a sáv életre kel és kérdez vissza ~2-3 másodperccel a találatok megjelenése után
- "AI regulation" típusú konkrét kereséseknél NEM kérdez (should_clarify=false)
- [✕] gombbal a sáv azonnal idle állapotba kerül, q paraméter törlődik
- Mobil 393px-en olvasható és működő
- Build és deploy hibamentes