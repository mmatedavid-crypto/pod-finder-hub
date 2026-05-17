import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import CategoriesPage from "./pages/CategoriesPage.tsx";
import CategoryDetail from "./pages/CategoryDetail.tsx";
import PodcastDetail from "./pages/PodcastDetail.tsx";
import EpisodeDetail from "./pages/EpisodeDetail.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import GrowthStatusPage from "./pages/GrowthStatusPage.tsx";
import EntityPage from "./pages/EntityPage.tsx";
import TopicHubPage from "./pages/TopicHubPage.tsx";
import TopicsIndexPage from "./pages/TopicsIndexPage.tsx";
import PeopleIndexPage from "./pages/PeopleIndexPage.tsx";
import CompaniesIndexPage from "./pages/CompaniesIndexPage.tsx";

import PageViewTracker from "./components/PageViewTracker.tsx";
import PrivacyPage from "./pages/PrivacyPage.tsx";
import TermsPage from "./pages/TermsPage.tsx";
import MoodCollectionPage from "./pages/MoodCollectionPage.tsx";
import MoodsPage from "./pages/MoodsPage.tsx";

import AboutPage from "./pages/AboutPage.tsx";
import ContactPage from "./pages/ContactPage.tsx";
import MethodologyPage from "./pages/MethodologyPage.tsx";
import NewPodcastsPage from "./pages/NewPodcastsPage.tsx";
import DailyBriefPage from "./pages/DailyBriefPage.tsx";
import AdminLivePage from "./pages/AdminLivePage.tsx";
import AdminInsightsPage from "./pages/AdminInsightsPage.tsx";
import AdminXReplyAssistantPage from "./pages/AdminXReplyAssistantPage.tsx";
import AdminTikTokPage from "./pages/AdminTikTokPage.tsx";
import AdminTranscriptROIPage from "./pages/AdminTranscriptROIPage.tsx";
import UnsubscribePage from "./pages/UnsubscribePage.tsx";
import { SearchHotkey } from "./components/SearchHotkey.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PageViewTracker />
        <SearchHotkey />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/category/:slug" element={<CategoryDetail />} />
          <Route path="/podcast/:podcastSlug" element={<PodcastDetail />} />
          <Route path="/podcast/:podcastSlug/:episodeSlug" element={<EpisodeDetail />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/auth" element={<AuthPage />} />
          

          <Route path="/growth-status" element={<GrowthStatusPage />} />
          <Route path="/topics" element={<TopicsIndexPage />} />
          <Route path="/people" element={<PeopleIndexPage />} />
          <Route path="/companies" element={<CompaniesIndexPage />} />
          <Route path="/topic/:slug" element={<TopicHubPage />} />
          <Route path="/person/:slug" element={<EntityPage kind="person" />} />
          <Route path="/company/:slug" element={<EntityPage kind="company" />} />
          <Route path="/ticker/:slug" element={<EntityPage kind="ticker" />} />
          <Route path="/ingredient/:slug" element={<EntityPage kind="ingredient" />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/moods" element={<MoodsPage />} />
          <Route path="/mood/:slug" element={<MoodCollectionPage />} />
          
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/new" element={<NewPodcastsPage />} />
          <Route path="/daily" element={<DailyBriefPage />} />
          <Route path="/admin/live" element={<AdminLivePage />} />
          <Route path="/admin/insights" element={<AdminInsightsPage />} />
          <Route path="/admin/x-reply-assistant" element={<AdminXReplyAssistantPage />} />
          <Route path="/admin/tiktok" element={<AdminTikTokPage />} />
          <Route path="/admin/transcript-roi" element={<AdminTranscriptROIPage />} />
          <Route path="/unsubscribe" element={<UnsubscribePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
