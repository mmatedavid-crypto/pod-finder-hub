
# Role-aware people extraction — v2 design

A jelenlegi `people: string[]` helyett strukturált `people_roles` lesz, és **több réteg** biztosítja hogy Epstein-szerű esetek (halott / történelmi / hír-alany) sosem kerüljenek "guest" vagy "host" szekcióba.

## Szerep-taxonomy (4 érték)

| role | jelentés | szekció EntityPage-en |
|---|---|---|
| `host` | a show állandó házigazdája | "As host of …" |
| `guest` | **élő, hangban jelen lévő** vendég | "Appears as guest in" |
| `subject` | az epizód **róla szól**, de nincs jelen (halott / hír-alany / történelmi / publikus szereplő akit elemeznek) | "Episodes about …" |
| `mentioned` | csak felmerül, nem központi | "Also mentioned in" (weak) |

A `mentioned` mindig fallback — bizonytalanság esetén ide degradálunk.

## Hogyan lesz megbízható (4 réteg)

### 1. Prompt definíciók + few-shot példák
A Gemini tool-schema mezője:
```
people: [{ name, role: "host"|"guest"|"subject"|"mentioned",
           present_in_episode: bool,
           is_deceased_or_historical: bool,
           confidence: 0..1 }]
```
A system prompt explicit példákkal tanítja:
- "The Epstein Files: What Really Happened" → Epstein = **subject**, present=false, deceased=true
- "Sam Altman on the future of AI" → Altman = **guest**, present=true
- "Remembering Kobe Bryant" → Kobe = **subject**, deceased=true
- "Why Putin can't win" → Putin = **subject**, present=false (nem vendég csak azért mert nyilvános alak)
- "Tucker interviews Musk" → Tucker = **host**, Musk = **guest**
- "The rise and fall of FTX" + SBF név → SBF = **subject**

Kulcs: Gemini-nek **van** elég világtudása hogy tudja Epstein halott, Hitler történelmi, stb. Nem kell külön halott-lista.

### 2. Deterministic title-pattern post-check
A LLM válaszára futó olcsó regex-szabályok, amik **felülírják** ha ellentmondanak:

| ha a title tartalmazza… | és LLM szerint `guest` | → felülírjuk |
|---|---|---|
| `X's death`, `the X case`, `remembering X`, `X's legacy`, `the murder of X`, `who killed X`, `the rise and fall of X` | igen | `subject` |
| `X's [bármi]` (possessive, és nincs "with X" / "joins" / "feat" / "ft." / "interview with") | igen | `subject` |
| `the [X] files`, `[X] exposed`, `inside [X]` | igen | `subject` |

És fordítva (subject → guest promotion):
| ha title tartalmazza… | és LLM szerint `subject` | → |
|---|---|---|
| `with [X]`, `feat. [X]`, `ft. [X]`, `[X] joins`, `interview with [X]`, `[X] on [topic]` | igen, és `is_deceased=false` | `guest` |

### 3. Host-tábla suppression
Külön `podcast_hosts` táblát épít a már elindított Excel-flow (most fut a labeling). Amint visszajön a kitöltött fájl, betöltjük. Ezután:
- Ha az LLM `guest`-nek jelölt valakit aki **az adott podcast host-listáján van** → `host`.
- A `is_deceased_or_historical=true` flag biztosítja hogy halott személy sose lehessen host.

### 4. Confidence-floor + cap
- `confidence < 0.5` → automatikus degradálás `mentioned`-re.
- Per epizód max 2 `guest`, max 1 `host`, korlátlan `subject`/`mentioned` (de összesen max 8).
- Ha 3+ "guest" van → a 3. plusztól mind `mentioned`.

## EntityPage szekciók (új struktúra)

A jelenlegi `classifyEntityMatch` (pozíció-alapú Strong/Medium/Weak) **megszűnik** person-re. Helyette `episodes.people_roles` JSONB-ből húzzuk:

```
[Person Page: Jeffrey Epstein]
  Bio
  Episodes about Epstein (subject)        ← itt jelenik meg minden Epstein-epizód
  Mentioned in                              ← passing references
  (Appears as guest in / As host of üres) ← halott személynél sosem jelenik meg
```

Topic / company / ticker oldalak **változatlanok** maradnak — ott a pozíció-alapú strength elég jó.

## Adat-modell

Új JSONB oszlop `episodes`-en (nem új tábla — fele költségen marad, mégis lekérdezhető GIN-nel):
```
ALTER TABLE episodes ADD COLUMN people_roles jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX idx_episodes_people_roles_gin ON episodes USING GIN (people_roles jsonb_path_ops);
```
A meglévő `episodes.people text[]` megmarad (search_text + backwards compat) — runner mindkettőt frissíti: a `people[]`-be a nevek mennek, a `people_roles`-ba a strukturált változat.

## Mit kell változtatni (5 fájl)

1. **`supabase/functions/_shared/entity-prompt.ts`** — új tool schema (role/present/deceased/confidence) + few-shot example block.
2. **`supabase/functions/entity-extract-runner/index.ts`** — title-pattern post-check + confidence floor + cap; írja a `people_roles` oszlopot is; `ai_entities_version=2` jelzéssel.
3. **Migráció** — `people_roles` oszlop + GIN index, és egy `episodes_with_subject_role` indexes RPC az EntityPage-hez.
4. **`src/pages/EntityPage.tsx`** — person ágon új szekciók (Episodes about / Mentioned in / [host & guest ha lesz]), `classifyEntityMatch` helyett szerepfilter.
5. **`src/lib/entity.ts`** — új helper `getPersonRole(episode, slug): role` ami a `people_roles` JSON-ből olvas.

## Re-extraction

Az `ai_entities_version=2` mező alapján `seo-enrich-enqueue` mintájára egy `entity-reextract-enqueue` RPC futtatja végig a ~9 600 epizódot. Költség: kb. **$0.35** Gemini Flash Lite-tal (+ ~200 tok prompt overhead a few-shot miatt). Tier-aware priority (S→A→B→C), adaptív cron már megvan.

## Mit NEM csinálunk most

- Külön `episode_people` táblát (overkill — JSONB+GIN elég 1M epizódig).
- Halott-személy DB-t (Gemini tudja, és a `deceased` flag visszaellenőrizhető).
- Transcript-corroboration-t — alacsony lefedettség, és a fenti 4 réteg már elég jó. Külön sprint amikor a transcript coverage >50%.

---

**Eredmény Epstein-tesztre:**
- LLM: `{name: "Jeffrey Epstein", role: "subject", present: false, deceased: true, confidence: 0.95}`
- Post-check: title pattern "the X files" / "X's death" — már `subject`, marad.
- EntityPage: csak az "Episodes about Jeffrey Epstein" szekcióban jelenik meg. Soha nem lesz "Appears as guest".

Élő alanyokra (Trump, Musk, Putin akik gyakran szerepelnek de adott epizódban csak róluk **beszélnek**): a `present_in_episode=false` + title pattern `subject`-ra teszi. Csak ha "with Musk" / "Musk joins" minta van, akkor lesz `guest`.

Mehetek implementálni?
