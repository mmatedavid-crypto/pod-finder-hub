## Heti AI mood-pool tanulás

5-10 új mood koncepciót generálunk hetente AI-val a valós keresési adatokból. Pool sapka: 20. Gyenge teljesítményűek (CTR alapján) automatikusan kiesnek. A 2 dinamikus slot ebből a poolból választ a látogató kontextusához.

### Adatmodell (új tábla)
- `mood_pool` (id, slug, title, mood, description, query, accent_hsl, embedding vector(768), episode_ids uuid[], episodes_refreshed_at, time_tags text[] — pl. `morning,evening,weekend,weekday,focus,wind-down,any`, country_hint text NULL = global, status `active|retired`, impressions int, clicks int, ctr numeric generated, created_at, last_shown_at, retired_at, retire_reason)
- Index: `(status, ctr desc)`, HNSW az embeddingre (későbbi semantic dedup-hoz).

### RPC-k (SECURITY DEFINER, public)
- `mood_pool_pick(p_country, p_hour, p_dow, p_k)` — visszaad `p_k` aktív moodot, szűr time_tags-re (hour/dow → matching tag-ek), véletlen tiebreak + frissesség boost. Ha kevés a találat, `any`-vel pótol.
- `mood_pool_bump_impression(p_slug)` és `mood_pool_bump_click(p_slug)` — atomic counter.
- `mood_pool_retire_overflow(p_keep)` — aktív sorokat tartja TOP `p_keep`-ig (impressions ≥ 50 esetén CTR alapján; friss <50 imp védve van új-grace-szel).

### Új edge function: `mood-pool-refresh` (heti cron)
Folyamat:
1. Olvas top 200 keresési query-t a `search_events` tábláb ól (utolsó 7 nap, `result_count > 0`).
2. Lekér 8 jelenlegi pool címet (kontextusként az AI-nak: ne ismételd).
3. Gemini 2.5 Flash → 5-10 új evergreen mood (title, mood, desc, query, accent_hsl, time_tags). System prompt hangsúlyozza: evergreen (nem napi hír), distinct a meglévőktől, természetes nyelv.
4. Minden új mood query embed-elve → `match_episodes_by_embedding(limit 12, max_age 30)` tölti fel.
5. Insert into `mood_pool` (slug = `dyn-{slugify(title)}`, status=active). Duplikáció (slug) → skip.
6. `mood_pool_retire_overflow(20)` futtatása.
7. Lock (advisory lock) hogy egyszerre csak egy fusson.

### Módosított `mood-personalize`
- Cache miss esetén már NEM generál új koncepciót — csak `mood_pool_pick(country, hour, dow, 2)` hívás, episode_ids hidratálása, payload visszaadás.
- Ha pool < 4 aktív (hidegindítás) → fallback a régi inline AI generálás 1× (one-shot), és háttérben kéri a `mood-pool-refresh`-t (`fire-and-forget`).
- Megtartjuk a 6h cache-t country/hour/dow szerint.
- Impression bump: cache miss-kor minden visszaadott mood-ra `mood_pool_bump_impression`.

### Frontend
- `MoodCollections.tsx`: dinamikus slot kattintáskor `supabase.rpc('mood_pool_bump_click', { p_slug })` (fire-and-forget, hibát elnyel).
- Egyébként a UI változatlan (még mindig 2 statikus + 2 dinamikus chip).

### Cron
- Új jobid heti: `0 4 * * 1` (hétfő 04:00 UTC) → `mood-pool-refresh`.
- pg_cron `cron.schedule` az `insert` tool-lal (URL + anon key).

### Bootstrap
- A refresh függvényt egyszer manuálisan meghívjuk telepítés után, hogy a pool ne legyen üres.

### Költség
- Heti 1 AI hívás (Gemini Flash) ~$0.001 + 5-10 embedding ~$0.001. Elhanyagolható.

### Műszaki részletek
- `time_tag` mapping az RPC-ben: `hour 5-9 → morning`, `9-12 → mid-morning`, `12-14 → lunch`, `14-17 → afternoon`, `17-20 → evening`, `20-23 → night`, `else late-night`. `dow 0,6 → weekend` else `weekday`. Mood akkor matchel ha `'any' = ANY(time_tags)` vagy a kontextus tagek bármelyikét tartalmazza.
- Új-grace: az első 7 napban vagy <50 impression-ig nem retire-elhető (kivéve cap overflow-nál `created_at desc` tartja a frissebbeket).