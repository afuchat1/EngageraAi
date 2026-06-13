import React from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Key, Activity, Play, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Playground",
      href: "/playground",
      icon: Play,
    },
    {
      title: "Usage",
      href: "/usage",
      icon: Activity,
    },
    {
      title: "Docs",
      href: "/docs",
      icon: FileText,
    },
  ];

  return (
    <div className="pb-12 w-64 border-r min-h-[calc(100vh-3.5rem)] bg-card/50 hidden md:block">
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <h2 className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
            Overview
          </h2>
          <div className="space-y-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer",
                    location === item.href ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
