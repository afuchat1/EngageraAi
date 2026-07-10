import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter, setFallbackBearerToken, setUrlMapper, setGuestSessionId } from "@workspace/api-client-react";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { AlertProvider } from "@/components/ui/alert-toast";

import Landing from "./pages/landing";
import SignIn from "./pages/sign-in";
import SignUp from "./pages/sign-up";
import ForgotPassword from "./pages/forgot-password";
import ResetPassword from "./pages/reset-password";
import Dashboard from "./pages/dashboard";
import Playground from "./pages/playground";
import Usage from "./pages/usage";
import Docs from "./pages/docs";
import Settings from "./pages/settings";
import AdminOverview from "./pages/admin/overview";
import AdminDataset from "./pages/admin/dataset";
import AdminReviewer from "./pages/admin/reviewer";
import AdminModels from "./pages/admin/models";
import AdminAnalytics from "./pages/admin/analytics";
import NotFound from "@/pages/not-found";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const queryClient = new QueryClient();

const FN_BASE = `${SUPABASE_URL}/functions/v1`;

setAuthTokenGetter(() =>
  supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null)
);

setFallbackBearerToken(SUPABASE_ANON_KEY);

setUrlMapper((path) => {
  if (path.startsWith("/api/models")) return `${FN_BASE}/models`;
  if (path.startsWith("/api/api-keys")) return path.replace("/api/api-keys", `${FN_BASE}/api-keys`);
  if (path.startsWith("/api/usage/summary")) return `${FN_BASE}/usage/summary`;
  if (path.startsWith("/api/usage")) return path.replace("/api/usage", `${FN_BASE}/usage`);
  if (path.startsWith("/api/dashboard")) return `${FN_BASE}/dashboard`;
  if (path.startsWith("/api/chat")) return `${FN_BASE}/chat`;
  if (path.startsWith("/api/conversations")) return path.replace("/api/conversations", `${FN_BASE}/conversations`);
  if (path.startsWith("/api/healthz")) return `${FN_BASE}/status`;
  if (path.startsWith("/api/admin")) return path.replace("/api/admin", `${FN_BASE}/admin`);
  if (path.startsWith("/api/reviewer")) return path.replace("/api/reviewer", `${FN_BASE}/reviewer`);
  if (path.startsWith("/api/dataset-export")) return `${FN_BASE}/dataset-export`;
  return path;
});

const GUEST_SESSION_KEY = "engagera_guest_session_id";
function getOrCreateGuestSessionId(): string {
  let id = localStorage.getItem(GUEST_SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(GUEST_SESSION_KEY, id);
  }
  return id;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/sign-in");
    }
  }, [user, loading, setLocation]);

  if (loading || !user) return null;

  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading, isForbidden } = useIsAdmin();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/sign-in");
    } else if (!loading && user && !isLoading && isForbidden) {
      setLocation("/dashboard");
    }
  }, [user, loading, isLoading, isForbidden, setLocation]);

  if (loading || !user || isLoading || !isAdmin) return null;

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/docs" component={Docs} />
      <Route path="/sign-in" component={SignIn} />
      <Route path="/sign-up" component={SignUp} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/playground"><ProtectedRoute component={Playground} /></Route>
      <Route path="/usage"><ProtectedRoute component={Usage} /></Route>
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
      <Route path="/admin"><AdminRoute component={AdminOverview} /></Route>
      <Route path="/admin/dataset"><AdminRoute component={AdminDataset} /></Route>
      <Route path="/admin/reviewer"><AdminRoute component={AdminReviewer} /></Route>
      <Route path="/admin/models"><AdminRoute component={AdminModels} /></Route>
      <Route path="/admin/analytics"><AdminRoute component={AdminAnalytics} /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    setGuestSessionId(getOrCreateGuestSessionId());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConfirmProvider>
          <AlertProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </AlertProvider>
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
