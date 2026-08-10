import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, LogOut, User } from "lucide-react";
import { logoSrc } from "@/lib/assets";
import { useAuth } from "@/hooks/useAuth";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Chat" },
    { href: "/docs", label: "Docs" },
  ];

  return (
    <div className="flex flex-col h-full bg-black text-white">
      <header className="shrink-0 bg-black/95 backdrop-blur-sm z-30 border-b border-white/[0.06]">
        <div className="flex items-center px-4 md:px-6 h-12">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <img src={logoSrc} alt="Engagera" className="w-6 h-6 rounded-md" />
            <span className="font-bold text-sm tracking-tight">Engagera</span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-5 text-sm ml-6">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`transition-colors ${
                  location === href ? "text-white" : "text-white/40 hover:text-white"
                }`}
              >
                {label}
              </Link>
            ))}
            {user && (
              <Link
                href="/usage"
                className={`transition-colors ${
                  location === "/usage" ? "text-white" : "text-white/40 hover:text-white"
                }`}
              >
                Usage
              </Link>
            )}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Desktop auth */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-sm text-white/40">
                  <User className="w-3.5 h-3.5" />
                  <span className="max-w-[140px] truncate">{user.email}</span>
                </div>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            ) : (
              <>
                <Link href="/sign-in">
                  <button className="px-3.5 py-1.5 text-sm text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06]">
                    Sign in
                  </button>
                </Link>
                <Link
                  href="/sign-up"
                  className="px-3.5 py-1.5 text-sm bg-white text-black font-semibold rounded-lg hover:bg-white/90 transition-colors"
                >
                  Get started
                </Link>
              </>
            )}
          </div>

          {/* Mobile: sign-in shortcut always visible */}
          {!user && (
            <Link href="/sign-in" className="md:hidden">
              <button className="ml-2 px-3 py-1.5 text-xs font-medium text-white/60 border border-white/15 rounded-lg hover:bg-white/[0.06] transition-colors">
                Sign in
              </button>
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden ml-1 p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        {/* Mobile dropdown menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/[0.06] px-4 py-3 space-y-1 bg-black/95">
            {navLinks.map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
                <div
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                    location === href
                      ? "text-white bg-white/[0.07]"
                      : "text-white/50 hover:text-white hover:bg-white/[0.05]"
                  }`}
                >
                  {label}
                </div>
              </Link>
            ))}
            {user && (
              <Link href="/usage" onClick={() => setMobileOpen(false)}>
                <div className="px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer">
                  Usage
                </div>
              </Link>
            )}

            {/* Mobile auth section */}
            <div className="pt-2 border-t border-white/[0.06] mt-2 space-y-2">
              {user ? (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-white/30">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <button
                    onClick={() => { signOut(); setMobileOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/sign-in" onClick={() => setMobileOpen(false)}>
                    <div className="px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer">
                      Sign in
                    </div>
                  </Link>
                  <a
                    href="/sign-up"
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2.5 rounded-xl text-sm font-semibold text-black bg-white hover:bg-white/90 transition-colors text-center"
                  >
                    Get started with Engagera
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">{children}</main>
    </div>
  );
}
