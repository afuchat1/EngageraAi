import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { logoSrc } from "@/lib/assets";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-black text-white">
      <header className="shrink-0 flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/15 bg-black z-30">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2">
            <img src={logoSrc} alt="Engagera" className="w-7 h-7 rounded-md" />
            <span className="font-bold text-sm tracking-tight">Engagera</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/" className={`${location === "/" ? "text-white" : "text-white/50 hover:text-white"} transition-colors`}>
              Chat
            </Link>
            <Link href="/docs" className={`${location === "/docs" ? "text-white" : "text-white/50 hover:text-white"} transition-colors`}>
              Docs
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <Link href="/dashboard" className="px-4 py-1.5 border border-white/20 rounded-full hover:bg-white/10 transition-colors text-sm">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className="text-white/60 hover:text-white transition-colors text-sm">
                Sign in
              </Link>
              <Link href="/sign-up" className="px-4 py-1.5 rounded-full bg-white text-black font-medium hover:bg-white/90 transition-colors text-sm">
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
