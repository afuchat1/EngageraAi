import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-black text-white">
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/15">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-mono text-sm tracking-tight font-bold">
            ENGAGERA_
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/" className={`${location === "/" ? "text-white" : "text-white/60 hover:text-white"}`}>Chat</Link>
            <Link href="/docs" className={`${location === "/docs" ? "text-white" : "text-white/60 hover:text-white"}`}>Docs</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm font-mono uppercase">
          {user ? (
            <Link href="/dashboard" className="px-3 py-1 border border-white/20 hover:bg-white/10 transition-colors">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className="text-white/60 hover:text-white">
                Sign In
              </Link>
              <Link href="/sign-up" className="px-4 py-1.5 rounded-full border border-white hover:bg-white hover:text-black transition-colors text-xs">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        {children}
      </main>
    </div>
  );
}
