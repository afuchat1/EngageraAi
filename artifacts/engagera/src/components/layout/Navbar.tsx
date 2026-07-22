import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { logoSrc } from "@/lib/assets";
import { Menu, X } from "lucide-react";

export function Navbar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-center px-4 md:px-8 max-w-screen-xl mx-auto">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 mr-8 shrink-0">
          <img src={logoSrc} alt="Engagera" className="h-7 w-7 object-contain" />
          <span className="font-bold tracking-tight text-base text-foreground">Engagera</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium flex-1">
          <Link
            href="/docs"
            className={`transition-colors ${location === "/docs" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Docs
          </Link>
          <Link
            href="/generate"
            className={`transition-colors ${location === "/generate" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Generate
          </Link>
          {user && (
            <Link
              href="/usage"
              className={`transition-colors ${location === "/usage" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Usage
            </Link>
          )}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="ml-auto md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-background px-4 py-4 space-y-1">
          <MobileNavLink href="/docs"     onClick={() => setMobileOpen(false)}>Docs</MobileNavLink>
          <MobileNavLink href="/generate" onClick={() => setMobileOpen(false)}>Generate</MobileNavLink>
          {user && (
            <>
              <MobileNavLink href="/dashboard" onClick={() => setMobileOpen(false)}>Dashboard</MobileNavLink>
              <MobileNavLink href="/usage"     onClick={() => setMobileOpen(false)}>Usage</MobileNavLink>
            </>
          )}
        </div>
      )}
    </header>
  );
}

function MobileNavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick}>
      <div className="block px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer">
        {children}
      </div>
    </Link>
  );
}
