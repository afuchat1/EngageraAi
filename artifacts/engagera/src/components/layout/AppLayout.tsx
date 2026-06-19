import React from "react";
import { logoSrc } from "@/lib/assets";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Activity, Play, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  showSidebar?: boolean;
}

const mobileNavItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Playground", href: "/playground", icon: Play },
  { title: "Usage", href: "/usage", icon: Activity },
  { title: "Docs", href: "/docs", icon: FileText },
];

export function AppLayout({ children, requireAuth = false, showSidebar = false }: AppLayoutProps) {
  const { loading, user } = useAuth();
  const [location] = useLocation();

  if (requireAuth && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-5">
          <img src={logoSrc} alt="Engagera" className="h-10 w-10 object-contain opacity-80" />
          <div className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "120ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "240ms" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col bg-background overflow-hidden">
      <Navbar />
      <div className="flex-1 flex min-h-0">
        {showSidebar && user && <Sidebar />}
        <main className={cn("flex-1 overflow-y-auto min-w-0", showSidebar && user && "pb-16 md:pb-0")}>
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — only for authenticated sidebar pages */}
      {showSidebar && user && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur">
          <div className="flex items-stretch justify-around">
            {mobileNavItems.map((item) => {
              const active = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "flex flex-col items-center gap-1 px-4 py-3 cursor-pointer transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}>
                    <item.icon className="h-4 w-4" />
                    <span className="text-[10px] font-medium tracking-tight">{item.title}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
