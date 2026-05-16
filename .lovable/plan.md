## Cél

A `podiverzum.com/*` routon futó `podiverzum-bot-prerender` Worker régi kódot szolgál ki — a `/sitemap.xml` még a régi `yoxewklaybougzpmzvkg` projektre mutat, ezért a GSC 0 URL-t indexel a 3355-ből.

A repóban már megvan a friss kód (`infra/cloudflare-worker/worker.js`), csak fel kell tölteni. A secretekben van `CLOUDFLARE_API_TOKEN`, így a CF REST API-val edge function-ből deployolható, `wrangler` nélkül.

## Lépések

**1. Egyszer használatos edge function: `cf-worker-deploy`**
   - Input: nincs (vagy egy opcionális `dry_run` flag).
   - Olvas: `infra/cloudflare-worker/worker.js` tartalma — mivel ez nem futtatási env asset, a worker.js tartalmát base64-ben **beágyazom** a function source-ba egy `WORKER_SRC` konstansként build-time. (Edge function nem fér hozzá repo fájlokhoz futáskor.)
   - Hívja a CF API-t:
     - `GET /accounts` → account_id
     - `GET /zones?name=podiverzum.com` → zone_id
     - `PUT /accounts/{aid}/workers/scripts/podiverzum-bot-prerender` `multipart/form-data` body-val: `metadata` JSON + `worker.js` modul.
     - `GET /zones/{zid}/workers/routes` — ellenőrzés hogy `podiverzum.com/*` és `www.podiverzum.com/*` route-ok rá vannak-e kötve a scriptre; ha nem, `POST` route-ok.
   - Visszaad: deploy státusz, etag, route lista.

**2. Hívás**
   - `supabase.functions.invoke('cf-worker-deploy')` — admin oldalon egy gomb, vagy egyszer `curl`-lel a chatből.

**3. Verifikáció**
   - `curl -I https://podiverzum.com/sitemap.xml` → `X-Worker: podiverzum-bot-prerender`, `X-Sitemap-Source: edge-fn` header jelenik meg.
   - `curl https://podiverzum.com/sitemap.xml | head` → `podiverzum.com` URL-ek `iqzkayoqqagowvxeaphe`-ből, nem `yoxewklaybougzpmzvkg`-ből.
   - GSC-ben resubmit `https://podiverzum.com/sitemap.xml` → pár óra múlva "Discovered" URL count > 0.

**4. Tisztítás**
   - A function bent marad (újrahasználható későbbi update-ekhez — ha a `worker.js` megint változik, csak újra deployolom magát a functiont és újrahívom).
   - Opcionálisan admin UI gomb az `AdminHubPage`-en: "Redeploy CF Worker".

## Technikai részletek

- **Auth scope**: a `CLOUDFLARE_API_TOKEN` szükséges permission-jei: `Account › Workers Scripts:Edit`, `Zone › Workers Routes:Edit`, `Zone:Read`, `Account:Read`. Ha valamelyik hiányzik, a függvény tisztán jelzi (HTTP státusz + CF error).
- **Worker upload formátum** (modules syntax, ES module):
  ```
  PUT /accounts/{aid}/workers/scripts/podiverzum-bot-prerender
  Content-Type: multipart/form-data
  ─ metadata: {"main_module":"worker.js","compatibility_date":"2025-01-01"}
  ─ worker.js: <file, Content-Type: application/javascript+module>
  ```
- **Route binding**: a `wrangler.toml`-ban szereplő `podiverzum.com/*` és `www.podiverzum.com/*` route-okat a CF dashboardon már valószínűleg be vannak kötve (mert a régi worker fut) — ezeket nem kell újra létrehozni, csak validálni.
- **Nem kockázatos**: ha a deploy hibázik, a régi worker tovább fut. Ha sikerül de a worker hibás, a `fetch(request)` passthrough fallback miatt a site nem esik el — csak a bot prerender / sitemap proxy nem működik.

## Mit NEM csinálok

- Nem nyúlok a `public/sitemap.xml` static fájlhoz — a Worker proxy úgyis lefedi, és a static fájl már most is helyes.
- Nem módosítom a `worker.js` logikáját, csak ami már a repóban van, azt deployolom.
- Nem érintem a `.lovable/cloudflare-worker.js` változatot (az nincs élesben).

## Mehet?