
-- taste_cards
CREATE TABLE IF NOT EXISTS public.taste_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  subtitle        text,
  image_url       text,
  stage           text NOT NULL DEFAULT 'broad' CHECK (stage IN ('broad','refine')),
  sensitivity_level text NOT NULL DEFAULT 'safe' CHECK (sensitivity_level IN ('safe','sensitive')),
  priority        integer NOT NULL DEFAULT 0,
  topic_tags      text[] NOT NULL DEFAULT '{}',
  mood_tags       text[] NOT NULL DEFAULT '{}',
  format_tags     text[] NOT NULL DEFAULT '{}',
  psych_tags      text[] NOT NULL DEFAULT '{}',
  archetype_tags  text[] NOT NULL DEFAULT '{}',
  text_for_embedding text,
  card_embedding  vector(768),
  catalog_fit_score real,
  top_episode_similarity real,
  active          boolean NOT NULL DEFAULT true,
  validation_status text NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_taste_cards_active_stage ON public.taste_cards (active, stage);
CREATE INDEX IF NOT EXISTS idx_taste_cards_embedding ON public.taste_cards USING hnsw (card_embedding vector_cosine_ops);
ALTER TABLE public.taste_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taste_cards public read active" ON public.taste_cards FOR SELECT USING (active = true);
CREATE POLICY "taste_cards admin all" ON public.taste_cards FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_taste_cards_touch BEFORE UPDATE ON public.taste_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- landing_events
CREATE TABLE IF NOT EXISTS public.landing_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_session_id  text NOT NULL,
  event_name            text NOT NULL,
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  utm_content           text,
  utm_term              text,
  landing_variant       text,
  path                  text,
  referrer_domain       text,
  device_type           text,
  meta                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_landing_events_created ON public.landing_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_events_event ON public.landing_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_events_session ON public.landing_events (anonymous_session_id);
ALTER TABLE public.landing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "landing_events public insert" ON public.landing_events FOR INSERT WITH CHECK (true);
CREATE POLICY "landing_events admin read" ON public.landing_events FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- taste_interactions
CREATE TABLE IF NOT EXISTS public.taste_interactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_session_id  text NOT NULL,
  user_id               uuid,
  card_id               uuid NOT NULL REFERENCES public.taste_cards(id) ON DELETE CASCADE,
  action                text NOT NULL CHECK (action IN ('like','skip','super')),
  swipe_index           integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_taste_interactions_session ON public.taste_interactions (anonymous_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_taste_interactions_user ON public.taste_interactions (user_id, created_at DESC);
ALTER TABLE public.taste_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taste_interactions public insert" ON public.taste_interactions FOR INSERT WITH CHECK (true);
CREATE POLICY "taste_interactions admin read" ON public.taste_interactions FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- RPC: get_active_taste_cards
CREATE OR REPLACE FUNCTION public.get_active_taste_cards(p_limit integer DEFAULT 500)
RETURNS TABLE (
  id uuid, title text, subtitle text, image_url text, stage text, sensitivity_level text,
  priority integer, topic_tags text[], mood_tags text[], format_tags text[], psych_tags text[],
  archetype_tags text[], catalog_fit_score real, top_episode_similarity real, card_embedding text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, title, subtitle, image_url, stage, sensitivity_level, priority,
    topic_tags, mood_tags, format_tags, psych_tags, archetype_tags,
    catalog_fit_score, top_episode_similarity, card_embedding::text
  FROM public.taste_cards
  WHERE active = true AND card_embedding IS NOT NULL
  ORDER BY priority DESC, created_at ASC
  LIMIT GREATEST(1, p_limit)
$$;

-- RPC: match_episodes_by_taste_vector
CREATE OR REPLACE FUNCTION public.match_episodes_by_taste_vector(
  p_user_vector vector,
  p_negative_vector vector DEFAULT NULL,
  p_exclude_episode_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_limit integer DEFAULT 24
)
RETURNS TABLE (
  episode_id uuid, podcast_id uuid, title text, display_title text, slug text, image_url text,
  ai_summary text, podcast_title text, podcast_slug text, podcast_image_url text,
  similarity real, final_score real, topics text[], category text, published_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH scored AS (
    SELECT ee.episode_id, ee.podcast_id,
      (1.0 - (ee.embedding <=> p_user_vector))::real AS pos_sim,
      CASE WHEN p_negative_vector IS NULL THEN 0.0::real
           ELSE GREATEST(0.0, 1.0 - (ee.embedding <=> p_negative_vector))::real END AS neg_sim
    FROM public.episode_embeddings ee
    WHERE ee.episode_id <> ALL (COALESCE(p_exclude_episode_ids, ARRAY[]::uuid[]))
    ORDER BY ee.embedding <=> p_user_vector
    LIMIT GREATEST(p_limit * 4, 80)
  )
  SELECT e.id AS episode_id, e.podcast_id, e.title, e.display_title, e.slug, e.image_url,
    e.ai_summary, p.title AS podcast_title, p.slug AS podcast_slug, p.image_url AS podcast_image_url,
    s.pos_sim AS similarity, (s.pos_sim - 0.4 * s.neg_sim)::real AS final_score,
    e.topics, p.category, e.published_at
  FROM scored s
  JOIN public.episodes e ON e.id = s.episode_id
  JOIN public.podcasts p ON p.id = e.podcast_id
  WHERE (p.language IS NULL OR p.language ILIKE 'en%') AND e.published_at IS NOT NULL
  ORDER BY (s.pos_sim - 0.4 * s.neg_sim) DESC
  LIMIT p_limit
$$;

-- Seed broad cards (14)
INSERT INTO public.taste_cards (title, subtitle, stage, priority, topic_tags, mood_tags, archetype_tags, text_for_embedding) VALUES
  ('Politics & Public Life','Power, policy, who runs what — and why','broad',100,ARRAY['politics','public-life','society'],ARRAY['critical','analytical','honest'],ARRAY['public_radar'],'Podcasts about politics, government, public affairs, elections, policy debates, the people in charge.'),
  ('Economy & Markets','Money moves, markets, what the numbers really say','broad',100,ARRAY['economy','finance','markets','business'],ARRAY['analytical','objective'],ARRAY['market_realist','strategic_curious'],'Podcasts about the economy, finance, markets, investing, the forces shaping prosperity.'),
  ('Science & Discovery','Research, evidence, how things actually work','broad',100,ARRAY['science','research','nature'],ARRAY['curious','analytical'],ARRAY['science_explorer'],'Podcasts about science, scientific research, discoveries, evidence-based thinking, how the world works.'),
  ('Culture & Ideas','Books, film, art, ideas worth chewing on','broad',100,ARRAY['culture','arts','literature','film','ideas'],ARRAY['contemplative','honest'],ARRAY['culture_hunter'],'Podcasts about culture, arts, literature, film, philosophy, ideas, intellectual life.'),
  ('Sports','Games, athletes, the human side of competition','broad',100,ARRAY['sports','athletes','competition'],ARRAY['energetic','exciting'],ARRAY['performance_watcher','discovery_listener'],'Podcasts about sports, athletes, teams, leagues, competition, the human stories behind the games.'),
  ('Health & Wellbeing','Body, mind, how to feel better in both','broad',100,ARRAY['health','wellness','medicine','mental-health'],ARRAY['honest','inspiring'],ARRAY['performance_watcher','meaning_seeker'],'Podcasts about health, wellness, mental health, medicine, longevity, taking care of body and mind.'),
  ('Technology & AI','Where tech is going — and what it will change','broad',100,ARRAY['technology','ai','startups','innovation'],ARRAY['curious','exciting','analytical'],ARRAY['future_watcher','strategic_curious'],'Podcasts about technology, artificial intelligence, software, startups, the future of how we live and work.'),
  ('Lifestyle & Personal Growth','Habits, relationships, the small things that add up','broad',100,ARRAY['lifestyle','self-improvement','relationships','habits'],ARRAY['inspiring','honest','personal'],ARRAY['performance_watcher','meaning_seeker'],'Podcasts about lifestyle, personal growth, habits, relationships, productivity, designing a good life.'),
  ('Literature & Writing','Books, writers, the craft of telling stories','broad',100,ARRAY['literature','books','writing','authors'],ARRAY['contemplative','curious'],ARRAY['culture_hunter','deep_dive'],'Podcasts about literature, books, writers, authors, the craft of writing and reading.'),
  ('Food & Drink','Cooking, chefs, what we eat and why','broad',100,ARRAY['food','cooking','restaurants','drink'],ARRAY['warm','personal','playful'],ARRAY['culture_hunter','discovery_listener'],'Podcasts about food, cooking, chefs, restaurants, ingredients, drink, the culture of eating.'),
  ('Travel & Place','Cities, countries, what makes a place worth knowing','broad',100,ARRAY['travel','places','cities','geography'],ARRAY['curious','exploratory'],ARRAY['discovery_listener'],'Podcasts about travel, destinations, cities, countries, the culture and feel of different places.'),
  ('True Crime & Investigations','Real cases, real stakes, careful reporting','broad',100,ARRAY['true-crime','investigation','crime'],ARRAY['tense','dark','exciting'],ARRAY['story_collector','public_radar'],'Podcasts about true crime, real investigations, courtroom stories, mysteries solved and unsolved.'),
  ('Business & Leadership','Founders, companies, how things get built','broad',100,ARRAY['business','leadership','entrepreneurship','strategy'],ARRAY['analytical','inspiring'],ARRAY['strategic_curious','market_realist'],'Podcasts about business, leadership, entrepreneurship, building companies, strategy and management.'),
  ('Comedy & Humor','Sharp, silly, sometimes both at once','broad',100,ARRAY['comedy','humor','entertainment'],ARRAY['funny','playful','ironic'],ARRAY['discovery_listener'],'Podcasts about comedy, humor, funny conversations, satire, entertainment that makes you laugh.');

-- Seed refine cards (12)
INSERT INTO public.taste_cards (title, subtitle, stage, priority, topic_tags, mood_tags, format_tags, archetype_tags, text_for_embedding) VALUES
  ('Long, deep interviews','90+ minutes with one fascinating guest','refine',80,ARRAY['interview','long-form'],ARRAY['deep','contemplative'],ARRAY['long-form','interview'],ARRAY['deep_dive','story_collector'],'Podcasts that are long-form, in-depth interviews — 90 minutes or more with a single guest exploring everything.'),
  ('Crisp daily news briefings','10–20 minutes, what you need to know','refine',80,ARRAY['news','daily','briefing'],ARRAY['objective','analytical'],ARRAY['daily','short-form'],ARRAY['public_radar'],'Short daily news briefings — concise, well-edited, what mattered today in 10 to 20 minutes.'),
  ('Narrative storytelling','Reported stories, scored like a film','refine',80,ARRAY['narrative','storytelling','documentary'],ARRAY['contemplative','exciting'],ARRAY['narrative','documentary'],ARRAY['story_collector','culture_hunter'],'Narrative podcasts — reported stories with characters, plot, scoring, like a documentary you listen to.'),
  ('Two friends having a chat','Casual, funny, unfiltered conversations','refine',80,ARRAY['chat','conversation','friends'],ARRAY['funny','warm','personal'],ARRAY['chat','conversational'],ARRAY['discovery_listener'],'Casual chat shows — two or three friends talking, riffing, joking, no script, no edit.'),
  ('Expert explainers','A specialist walking you through one topic','refine',80,ARRAY['explainer','expert','education'],ARRAY['analytical','curious'],ARRAY['explainer','educational'],ARRAY['science_explorer','strategic_curious'],'Expert explainer podcasts — a specialist taking you through one topic in depth, teaching as they go.'),
  ('Investing & macro','Markets, central banks, where money is moving','refine',80,ARRAY['investing','macro','markets','finance'],ARRAY['analytical','objective'],ARRAY['expert'],ARRAY['market_realist'],'Podcasts about investing, macroeconomics, central banks, asset markets, where money is moving.'),
  ('Founders & startup stories','The people building new things','refine',80,ARRAY['startups','founders','entrepreneurship','business'],ARRAY['inspiring','honest'],ARRAY['interview'],ARRAY['strategic_curious','story_collector'],'Founder interviews and startup stories — the people building new companies, what they learned, what broke.'),
  ('AI, frontier tech','New models, new tools, what is coming next','refine',80,ARRAY['ai','technology','frontier-tech','machine-learning'],ARRAY['curious','exciting'],ARRAY['expert','interview'],ARRAY['future_watcher'],'Podcasts about AI, machine learning, frontier technology — what new models do, what is coming next.'),
  ('Mental health & psychology','Real talk about how minds work','refine',80,ARRAY['psychology','mental-health','therapy'],ARRAY['honest','personal','contemplative'],ARRAY['interview','conversational'],ARRAY['meaning_seeker','story_collector'],'Podcasts about psychology, mental health, therapy, how the mind works, honest conversations about emotions.'),
  ('Philosophy, religion, big questions','Meaning, ethics, what we live for','refine',80,ARRAY['philosophy','religion','spirituality','ethics'],ARRAY['contemplative','honest'],ARRAY['interview','explainer'],ARRAY['meaning_seeker','culture_hunter'],'Podcasts about philosophy, religion, spirituality, ethics, the big questions about meaning and how to live.'),
  ('History deep dives','One era, one event, told carefully','refine',80,ARRAY['history','past','documentary'],ARRAY['contemplative','curious'],ARRAY['narrative','explainer'],ARRAY['culture_hunter','deep_dive'],'History podcasts — careful deep dives into one era, one war, one event, told story by story.'),
  ('Sports talk & analysis','Game breakdowns, player stories, debate','refine',80,ARRAY['sports','analysis','commentary'],ARRAY['energetic','funny'],ARRAY['chat','expert'],ARRAY['performance_watcher','discovery_listener'],'Sports talk shows — game analysis, player stories, debates, the rhythm of the season.');
