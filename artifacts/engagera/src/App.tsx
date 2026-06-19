import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter, setFallbackBearerToken, setUrlMapper } from "@workspace/api-client-react";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

import Landing from "./pages/landing";
import SignIn from "./pages/sign-in";
import SignUp from "./pages/sign-up";
import ForgotPassword from "./pages/forgot-password";
import ResetPassword from "./pages/reset-password";
import Dashboard from "./pages/dashboard";
import Playground from "./pages/playground";
import Usage from "./pages/usage";
import Docs from "./pages/docs";
import NotFound from "@/pages/not-found";

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
  return path;
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/sign-in" component={SignIn} />
      <Route path="/sign-up" component={SignUp} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/playground" component={Playground} />
      <Route path="/usage" component={Usage} />
      <Route path="/docs" component={Docs} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
