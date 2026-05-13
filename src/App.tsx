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
import AdminHubPage from "./pages/AdminHubPage.tsx";
import AdminPage from "./pages/AdminPage.tsx";
import AdminAnalyticsPage from "./pages/AdminAnalyticsPage.tsx";
import AdminAiEnrichmentPage from "./pages/AdminAiEnrichmentPage.tsx";
import AdminAutopilotPage from "./pages/AdminAutopilotPage.tsx";
import AdminBootstrapPage from "./pages/AdminBootstrapPage.tsx";
import AdminCronStatusPage from "./pages/AdminCronStatusPage.tsx";
import AdminDiscoveryPage from "./pages/AdminDiscoveryPage.tsx";
import AdminFeedbackPage from "./pages/AdminFeedbackPage.tsx";
import AdminGrowthPage from "./pages/AdminGrowthPage.tsx";
import AdminQueuePage from "./pages/AdminQueuePage.tsx";
import AdminSearchInsightsPage from "./pages/AdminSearchInsightsPage.tsx";
import AdminSocialPostsPage from "./pages/AdminSocialPostsPage.tsx";
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
          <Route path="/topic/:slug" element={<EntityPage kind="topic" />} />
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
          <Route path="/admin" element={<AdminHubPage />} />
          <Route path="/admin/podcasts" element={<AdminPage />} />
          <Route path="/admin/live" element={<AdminLivePage />} />
          <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
          <Route path="/admin/ai-enrichment" element={<AdminAiEnrichmentPage />} />
          <Route path="/admin/autopilot" element={<AdminAutopilotPage />} />
          <Route path="/admin/cron-status" element={<AdminCronStatusPage />} />
          <Route path="/admin/discovery" element={<AdminDiscoveryPage />} />
          <Route path="/admin/feedback" element={<AdminFeedbackPage />} />
          <Route path="/admin/growth" element={<AdminGrowthPage />} />
          <Route path="/admin/queue" element={<AdminQueuePage />} />
          <Route path="/admin/search-insights" element={<AdminSearchInsightsPage />} />
          <Route path="/admin/social" element={<AdminSocialPostsPage />} />
          <Route path="/admin-bootstrap" element={<AdminBootstrapPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
