import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { BriefHistoryPage } from "./pages/BriefHistoryPage";
import { BriefPage } from "./pages/BriefPage";
import { LandingPage } from "./pages/LandingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TimelinePage } from "./pages/TimelinePage";
import { VaultsPage } from "./pages/VaultsPage";

const queryClient = new QueryClient();

const container = document.getElementById("root");
if (!container) throw new Error("missing #root");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<App />}>
            <Route index element={<LandingPage />} />
            <Route path="briefs" element={<BriefHistoryPage />} />
            <Route path="briefs/:id" element={<BriefPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="vaults" element={<VaultsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
