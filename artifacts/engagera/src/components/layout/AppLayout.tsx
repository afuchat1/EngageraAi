import React from "react";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/hooks/useAuth";

interface AppLayoutProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  showSidebar?: boolean;
}

export function AppLayout({ children, requireAuth = false, showSidebar = false }: AppLayoutProps) {
  const { loading, user } = useAuth();

  if (requireAuth && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex space-x-2">
          <div className="h-2 w-2 bg-primary rounded-full"></div>
          <div className="h-2 w-2 bg-primary rounded-full delay-75"></div>
          <div className="h-2 w-2 bg-primary rounded-full delay-150"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <Navbar />
      <div className="flex-1 flex">
        {showSidebar && user && <Sidebar />}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
