import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ScenarioProvider } from "@/hooks/use-scenario";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import AllocationGridPage from "@/pages/allocation-grid";
import FracJobsPage from "@/pages/frac-jobs";
import HaulersPage from "@/pages/haulers";
import ImportPage from "@/pages/import";
import { Skeleton } from "@/components/ui/skeleton";

const pageTitles: Record<string, string> = {
  "/": "Gantt Schedule",
  "/allocation-grid": "Allocation Grid",
  "/frac-jobs": "Frac Jobs",
  "/haulers": "Haulers",
  "/import": "Import",
};

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/allocation-grid" component={AllocationGridPage} />
      <Route path="/frac-jobs" component={FracJobsPage} />
      <Route path="/haulers" component={HaulersPage} />
      <Route path="/import" component={ImportPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const [location] = useLocation();
  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  };

  const pageTitle = pageTitles[location] ?? "FleetSync";

  return (
    <ScenarioProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header
              className="flex items-center gap-3 px-4 shrink-0"
              style={{
                height: 48,
                borderBottom: "0.5px solid var(--fs-border)",
                background: "var(--fs-navy)",
              }}
            >
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fs-text-muted)", letterSpacing: "0.3px" }}>
                {pageTitle}
              </span>
            </header>
            <main className="flex-1 overflow-hidden">
              <Router />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </ScenarioProvider>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="space-y-4 text-center">
          <Skeleton className="h-10 w-10 rounded-full mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return <AuthenticatedApp />;
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
