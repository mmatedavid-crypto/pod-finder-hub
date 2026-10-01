# Podiverzum.com

English-language podcast discovery and episode search for Podiverzum.com.

## Stack
- **Frontend:** React 18 + Vite + Tailwind + React Router
- **Backend:** Lovable Cloud (Supabase Postgres + Auth + Edge Functions)
- **AI:** Lovable AI Gateway (Gemini / GPT) — no API key needed
- **RSS:** parsed server-side in the `fetch-rss` edge function

## Features
- English-only public experience on `podiverzum.com`
- Homepage with recent, evergreen, category, mood, and source-quality sections
- Hybrid search across episodes and podcasts by topic, person, company, ticker, or idea
- Podcast detail pages with platform links, feed health, summaries, entities, and episodes
- Episode detail pages with summaries, extracted entities, key moments, audio, and related episodes
- Topic, person, company, ticker, and ingredient hubs
- SEO infrastructure: canonical URLs, sitemap generation, robots.txt, llms.txt, OG images
- Admin and pipeline tools for growth, indexing, enrichment, analytics, and queue health

## Setup

### 1. Backend (already provisioned)
Lovable Cloud is already enabled. The schema is managed by the migrations under `supabase/migrations`, and server-side work runs through Supabase Edge Functions under `supabase/functions`.

### 2. Make yourself admin
1. Go to `/auth` in the app, sign up with email + password.
2. Open Lovable Cloud → Users, copy your User ID.
3. Run this SQL in Cloud → SQL editor:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('<your-user-id>', 'admin');
   ```
4. Refresh the relevant admin page.

### 3. Local development
Install dependencies and start Vite:

```bash
npm install
npm run dev
```

Run checks:

```bash
npm run lint
npm run test
npm run build
```

### 4. Deploy
Click **Publish** in the top-right of the Lovable editor — your app goes live at a `.lovable.app` URL.
Attach `podiverzum.com` via Project Settings → Domains.

## Product Boundary
This branch is the `.com` product and should remain English-first:

- UI copy, SEO metadata, search examples, and public-facing generated text should be English.
- Search calls from the public app should use the English language pool (`lang: "en"` or equivalent filters).
- Hungarian UI/copy belongs in the `.hu` product and should not be copied here without adapting it to English.
