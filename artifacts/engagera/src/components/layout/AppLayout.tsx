import React from "react";
import { Link, useLocation } from "wouter";
import { MessageSquare, Play, Book, LayoutDashboard, Activity, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function AppLayout({ children, title }: AppLayoutProps) {
  const [location] = useLocation();
  const { signOut, user } = useAuth();

  const navItems = [
    { href: "/", label: "Chat", icon: MessageSquare },
    { href: "/playground", label: "Playground", icon: Play },
    { href: "/docs", label: "Docs", icon: Book },
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/usage", label: "Usage", icon: Activity },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-black text-white selection:bg-white/20">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-white/15">
        <div className="p-6 border-b border-white/15">
          <Link href="/" className="font-mono text-sm tracking-tight font-bold hover:opacity-80">
            ENGAGERA_
          </Link>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                  isActive 
                    ? "bg-white/10 text-white font-medium" 
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/15">
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="truncate text-white/60 text-xs">{user?.email}</span>
            <button 
              onClick={() => signOut()}
              className="text-white/40 hover:text-white"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header (only visible on mobile, outside main) */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-white/15">
          <Link href="/" className="font-mono text-sm font-bold">ENGAGERA_</Link>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">{title || navItems.find(i => location.startsWith(i.href) && i.href !== "/")?.label || "App"}</span>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto scrollbar-thin relative flex flex-col">
          {/* Desktop header variant */}
          {title && (
            <div className="hidden md:block p-8 pb-0">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            </div>
          )}
          
          <div className="flex-1 p-4 md:p-8">
            {children}
          </div>
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden border-t border-white/15 bg-black flex items-center justify-around p-2">
          {navItems.filter(i => i.href !== "/usage").map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link 
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center p-2 gap-1 ${
                  isActive ? "text-white" : "text-white/40"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] uppercase font-mono">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
