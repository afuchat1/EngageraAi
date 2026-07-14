import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  MessageSquare, Book, LayoutDashboard, Activity, Settings, Menu, X,
  ChevronLeft, ChevronRight, ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { logoSrc } from "@/lib/assets";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

const NAV_ITEMS = [
  { href: "/",           label: "Chat",        icon: MessageSquare },
  { href: "/docs",       label: "Docs",         icon: Book },
  { href: "/dashboard",  label: "Dashboard",    icon: LayoutDashboard },
  { href: "/usage",      label: "Usage",        icon: Activity },
];

const BOTTOM_ITEMS = [
  { href: "/settings",   label: "Settings",     icon: Settings },
];

function NavLink({
  href, label, icon: Icon, active, collapsed,
}: {
  href: string; label: string; icon: React.ElementType;
  active: boolean; collapsed: boolean;
}) {
  return (
    <Link href={href}>
      <div
        title={collapsed ? label : undefined}
        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
          active
            ? "bg-white text-black"
            : "text-white/50 hover:text-white hover:bg-white/[0.07]"
        } ${collapsed ? "justify-center" : ""}`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span className="text-sm font-medium">{label}</span>}
        {collapsed && (
          <div className="absolute left-full ml-3 px-2.5 py-1 bg-white text-black text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
            {label}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function AppLayout({ children, title }: AppLayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navItems = isAdmin
    ? [...NAV_ITEMS, { href: "/admin", label: "Admin", icon: ShieldCheck }]
    : NAV_ITEMS;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "true"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("sidebar_collapsed", String(collapsed)); } catch {}
  }, [collapsed]);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const currentTitle =
    title ?? [...NAV_ITEMS, ...BOTTOM_ITEMS].find((i) => isActive(i.href))?.label ?? "";

  return (
    <div className="flex h-screen overflow-hidden bg-black text-white selection:bg-white/20">

      {/* ── Desktop Sidebar ─────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col shrink-0 transition-all duration-200 ease-in-out bg-[#080808] border-r border-white/[0.07] ${
          collapsed ? "w-[60px]" : "w-[220px]"
        }`}
      >
        {/* Logo */}
        <div className={`flex items-center gap-2.5 px-3 pt-5 pb-4 ${collapsed ? "justify-center" : ""}`}>
          <img src={logoSrc} alt="Engagera" className="w-7 h-7 rounded-lg shrink-0" />
          {!collapsed && (
            <span className="font-bold text-sm tracking-tight">Engagera</span>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              active={isActive(item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="px-2 pb-2 space-y-0.5 border-t border-white/[0.07] pt-2">
          {BOTTOM_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              active={isActive(item.href)}
              collapsed={collapsed}
            />
          ))}
        </div>

        {/* Collapse toggle */}
        <div className={`p-2 border-t border-white/[0.07] flex ${collapsed ? "justify-center" : "justify-end"}`}>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-1.5 text-white/30 hover:text-white hover:bg-white/[0.07] rounded-lg transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* ── Content column ─────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/[0.07] bg-[#080808] shrink-0">
          <div className="flex items-center gap-2">
            <img src={logoSrc} alt="Engagera" className="w-6 h-6 rounded-md" />
            <span className="font-bold text-sm tracking-tight">Engagera</span>
          </div>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="p-2 text-white/50 hover:text-white transition-colors rounded-xl">
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 bg-[#080808] border-l border-white/[0.07] p-0">
              <div className="flex flex-col h-full p-4">
                <div className="flex items-center gap-2 mb-6">
                  <img src={logoSrc} alt="Engagera" className="w-7 h-7 rounded-lg" />
                  <span className="font-bold text-sm">Engagera</span>
                </div>
                <nav className="flex-1 space-y-0.5">
                  {navItems.map((item) => (
                    <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                        isActive(item.href) ? "bg-white text-black" : "text-white/50 hover:text-white hover:bg-white/[0.07]"
                      }`}>
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                    </Link>
                  ))}
                </nav>
                <div className="border-t border-white/[0.07] pt-3 space-y-0.5">
                  {BOTTOM_ITEMS.map((item) => (
                    <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                        isActive(item.href) ? "bg-white text-black" : "text-white/50 hover:text-white hover:bg-white/[0.07]"
                      }`}>
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
                {user && (
                  <div className="mt-3 px-3 py-2">
                    <p className="text-xs text-white/30 truncate">{user.email}</p>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin flex flex-col">
          {title && (
            <div className="shrink-0 px-6 md:px-8 pt-8 pb-2">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            </div>
          )}
          <div className={`flex-1 ${title ? "p-6 md:p-8 pt-6" : "p-6 md:p-8"}`}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
