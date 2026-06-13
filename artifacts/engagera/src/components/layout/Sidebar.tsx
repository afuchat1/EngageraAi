import React from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Activity, Play, FileText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Playground", href: "/playground", icon: Play },
  { title: "Usage", href: "/usage", icon: Activity },
  { title: "Docs", href: "/docs", icon: FileText },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-56 border-r border-border min-h-[calc(100vh-3.5rem)] bg-background shrink-0">
      <nav className="flex-1 px-3 py-5 space-y-0.5">
        <p className="px-3 mb-3 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/50">
          Navigation
        </p>
        {navItems.map((item) => {
          const active = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all cursor-pointer",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.title}</span>
                {active && <ChevronRight className="h-3 w-3 opacity-60" />}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-border">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <img src="/logo.png" alt="Engagera" className="h-5 w-5 object-contain opacity-40" />
          <span className="text-xs text-muted-foreground/50 font-medium tracking-tight">Engagera Platform</span>
        </div>
      </div>
    </aside>
  );
}
