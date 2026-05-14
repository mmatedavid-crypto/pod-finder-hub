
CREATE TABLE IF NOT EXISTS public.topic_hubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  category text,
  accent_hsl text,
  aliases text[] NOT NULL DEFAULT '{}',
  bio text,
  episodes_summary text,
  episode_ids uuid[] NOT NULL DEFAULT '{}',
  featured_episode_ids uuid[] NOT NULL DEFAULT '{}',
  appearance_stats jsonb NOT NULL DEFAULT '{}',
  model text,
  cost_usd numeric DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  generated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topic_hubs_aliases_gin ON public.topic_hubs USING gin (aliases);
CREATE INDEX IF NOT EXISTS idx_topic_hubs_active ON public.topic_hubs (active, sort_order);

ALTER TABLE public.topic_hubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topic_hubs public read" ON public.topic_hubs FOR SELECT USING (true);
CREATE POLICY "topic_hubs admin write" ON public.topic_hubs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed ~25 curated hubs
INSERT INTO public.topic_hubs (slug, title, description, category, accent_hsl, aliases, sort_order) VALUES
('glp-1', 'GLP-1 & Weight Loss Drugs', 'Ozempic, Wegovy, Mounjaro and the GLP-1 revolution reshaping obesity, diabetes, and culture.', 'Health', '180 70% 45%',
  ARRAY['glp-1','glp1','ozempic','wegovy','mounjaro','semaglutide','tirzepatide','glp-1 drugs','glp-1 weight loss drugs','glp-1 drug pricing','ozempic wedding trend','weight loss drugs','glp-1 receptor agonists'], 10),
('ai-agents', 'AI Agents', 'Autonomous AI agents, tool use, and the agentic web — the next layer beyond chatbots.', 'Tech', '270 75% 55%',
  ARRAY['ai agents','agentic ai','autonomous agents','llm agents','agent frameworks','ai assistants','agentic workflows'], 20),
('ai-safety', 'AI Safety & Alignment', 'Existential risk, alignment research, governance, and the politics of frontier AI.', 'Tech', '0 70% 55%',
  ARRAY['ai safety','ai alignment','ai regulation','ai risk','existential risk','ai governance','superintelligence','ai ethics'], 30),
('longevity', 'Longevity & Healthspan', 'Living longer and better — from rapamycin and zone 2 cardio to the latest aging biology.', 'Health', '160 65% 45%',
  ARRAY['longevity','healthspan','anti-aging','aging','rapamycin','metformin','nad+','zone 2','biological age','blue zones','peter attia'], 40),
('psychedelics', 'Psychedelics & Mental Health', 'Psilocybin, MDMA, ketamine — therapy, research, decriminalization, and lived experience.', 'Health', '290 80% 60%',
  ARRAY['psychedelics','psilocybin','mdma','ketamine','ayahuasca','dmt','psychedelic therapy','psychedelic research','microdosing'], 50),
('mental-health', 'Mental Health', 'Anxiety, depression, trauma, therapy modalities, and modern emotional toolkits.', 'Health', '220 60% 60%',
  ARRAY['mental health','anxiety','depression','trauma','therapy','cbt','emdr','mindfulness','burnout'], 60),
('bitcoin', 'Bitcoin', 'Bitcoin price, policy, mining, ETFs, and the orange-pilled worldview.', 'Finance', '30 95% 55%',
  ARRAY['bitcoin','btc','bitcoin etf','bitcoin mining','bitcoin price','satoshi','lightning network','self-custody'], 70),
('crypto', 'Crypto & Web3', 'Ethereum, stablecoins, DeFi, regulation, and the broader crypto market beyond Bitcoin.', 'Finance', '250 70% 60%',
  ARRAY['crypto','cryptocurrency','ethereum','stablecoins','defi','web3','solana','crypto regulation','sec crypto'], 80),
('inflation', 'Inflation & The Economy', 'CPI prints, Fed decisions, the cost of living, and the macro backdrop.', 'Finance', '15 80% 55%',
  ARRAY['inflation','cpi','federal reserve','interest rates','rate cuts','rate hikes','recession','stagflation','consumer prices'], 90),
('tariffs', 'Tariffs & Trade War', 'Trump tariffs, China decoupling, supply chains, and the new trade order.', 'Politics', '0 75% 50%',
  ARRAY['tariffs','trade war','trump tariffs','china tariffs','trade policy','supply chain','decoupling','protectionism'], 100),
('iran-war', 'Iran Conflict', 'Israel-Iran escalation, the Strait of Hormuz, US foreign policy, and regional spillover.', 'Politics', '0 70% 45%',
  ARRAY['iran','iran war','iran conflict','iran-israel war','strait of hormuz','iran nuclear','us-iran relations','iran strikes','irgc'], 110),
('israel-gaza', 'Israel & Gaza', 'The war in Gaza, hostages, regional politics, and the global response.', 'Politics', '210 70% 45%',
  ARRAY['israel','gaza','hamas','israel-hamas war','gaza war','hostages','idf','west bank','netanyahu'], 120),
('ukraine-russia', 'Ukraine & Russia', 'The war in Ukraine, NATO posture, sanctions, and the path to (or from) peace.', 'Politics', '230 70% 50%',
  ARRAY['ukraine','russia','ukraine war','russia ukraine war','putin','zelensky','nato','sanctions russia'], 130),
('china', 'China & Geopolitics', 'Xi Jinping, Taiwan, the chip war, and US-China strategic competition.', 'Politics', '0 75% 55%',
  ARRAY['china','xi jinping','us-china relations','taiwan','china taiwan','chip war','semiconductor war','ccp','china economy'], 140),
('epstein', 'Epstein Files', 'The Epstein documents, Maxwell, the client list, and the political fallout.', 'Politics', '280 60% 50%',
  ARRAY['epstein','epstein files','jeffrey epstein','ghislaine maxwell','epstein list','epstein documents','epstein client list'], 150),
('trump-2nd-term', 'Trump Second Term', 'The Trump administration, executive orders, cabinet, and 2025+ political landscape.', 'Politics', '15 85% 50%',
  ARRAY['trump administration','trump second term','trump 2025','trump cabinet','maga movement','trump policy','executive orders'], 160),
('us-elections', 'US Elections', 'Campaigns, polling, primaries, and the 2026 midterm map.', 'Politics', '220 70% 55%',
  ARRAY['us elections','2024 election','2026 midterms','election polling','primary','campaign 2024','democratic primary','republican primary'], 170),
('immigration', 'Immigration', 'The border, ICE, deportations, asylum policy, and the politics of immigration.', 'Politics', '30 70% 50%',
  ARRAY['immigration','border crisis','ice','deportation','asylum','sanctuary cities','immigration policy','migrant crisis'], 180),
('housing', 'Housing & Real Estate', 'Mortgage rates, the affordability crisis, zoning, and the YIMBY movement.', 'Finance', '170 55% 50%',
  ARRAY['housing','housing crisis','real estate','mortgage rates','home prices','rent','yimby','zoning','housing affordability'], 190),
('climate', 'Climate Change', 'Energy transition, EVs, extreme weather, COP summits, and climate politics.', 'Science', '140 60% 45%',
  ARRAY['climate change','climate crisis','global warming','net zero','renewable energy','solar','wind power','climate policy','cop29','cop30'], 200),
('nuclear-energy', 'Nuclear Energy', 'SMRs, the nuclear renaissance, fusion, and the AI-driven power demand.', 'Science', '50 90% 55%',
  ARRAY['nuclear energy','nuclear power','smr','small modular reactors','fusion','nuclear renaissance','uranium'], 210),
('space', 'Space & SpaceX', 'Starship, Mars, satellites, the new space economy, and the cosmos beyond Earth.', 'Science', '230 80% 60%',
  ARRAY['space','spacex','starship','elon musk space','mars','nasa','satellites','space exploration','rocket launch'], 220),
('entrepreneurship', 'Entrepreneurship & Startups', 'Founders, fundraising, product-market fit, and the operator playbook.', 'Business', '180 65% 50%',
  ARRAY['entrepreneurship','startups','founders','venture capital','vc funding','seed round','startup advice','product market fit','bootstrapping'], 230),
('discipline', 'Discipline & Personal Growth', 'Habits, hard work, stoicism, and the modern self-improvement canon.', 'Self-improvement', '40 70% 55%',
  ARRAY['discipline','personal growth','self-improvement','habits','motivation','mindset','stoicism','resilience','grit'], 240),
('faith', 'Faith & Christianity', 'Christian theology, apologetics, scripture, and the modern conversation about God.', 'Religion', '40 60% 50%',
  ARRAY['faith','christianity','jesus','god','bible','theology','apologetics','prayer','church'], 250)
ON CONFLICT (slug) DO NOTHING;
