import React, { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";

import Landing from "./pages/landing";
import SignIn from "./pages/sign-in";
import SignUp from "./pages/sign-up";
import Dashboard from "./pages/dashboard";
import Playground from "./pages/playground";
import Usage from "./pages/usage";
import Docs from "./pages/docs";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

setAuthTokenGetter(() =>
  supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null)
);

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/sign-in" component={SignIn} />
      <Route path="/sign-up" component={SignUp} />
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
