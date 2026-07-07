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
    <div className="flex flex-col h-full bg-black text-white">
      <header className="shrink-0 flex items-center justify-between px-4 md:px-6 py-2.5 bg-black/95 backdrop-blur-sm border-b border-white/[0.07] z-30">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2">
            <img src={logoSrc} alt="Engagera" className="w-6 h-6 rounded-md" />
            <span className="font-bold text-sm tracking-tight">Engagera</span>
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-sm">
            <Link
              href="/"
              className={`transition-colors ${
                location === "/" ? "text-white" : "text-white/40 hover:text-white"
              }`}
            >
              Chat
            </Link>
            <Link
              href="/docs"
              className={`transition-colors ${
                location === "/docs" ? "text-white" : "text-white/40 hover:text-white"
              }`}
            >
              Docs
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <Link
              href="/dashboard"
              className="px-3.5 py-1.5 bg-white/[0.07] hover:bg-white/[0.12] rounded-full transition-colors text-sm"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-white/50 hover:text-white transition-colors text-sm px-3 py-1.5"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="px-3.5 py-1.5 rounded-full bg-white text-black font-medium hover:bg-white/90 transition-colors text-sm"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">{children}</main>
    </div>
  );
}
