import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

export function Navbar() {
  const { user, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setLocation("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-center px-4 md:px-8 max-w-screen-xl mx-auto">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 mr-8 shrink-0">
          <img src="/logo.png" alt="Engagera" className="h-7 w-7 object-contain" />
          <span className="font-bold tracking-tight text-base text-foreground">Engagera</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium flex-1">
          <Link
            href="/docs"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Docs
          </Link>
          {user && (
            <>
              <Link
                href="/playground"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Playground
              </Link>
              <Link
                href="/usage"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Usage
              </Link>
            </>
          )}
        </nav>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-2 ml-auto">
          {user ? (
            <>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="font-medium">
                  Dashboard
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleSignOut} className="font-medium">
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/sign-in">
                <Button variant="ghost" size="sm" className="font-medium">
                  Sign in
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button size="sm" className="font-semibold">
                  Get API Key
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="ml-auto md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 py-4 space-y-1">
          <MobileNavLink href="/docs" onClick={() => setMobileOpen(false)}>Docs</MobileNavLink>
          {user && (
            <>
              <MobileNavLink href="/dashboard" onClick={() => setMobileOpen(false)}>Dashboard</MobileNavLink>
              <MobileNavLink href="/playground" onClick={() => setMobileOpen(false)}>Playground</MobileNavLink>
              <MobileNavLink href="/usage" onClick={() => setMobileOpen(false)}>Usage</MobileNavLink>
            </>
          )}
          <div className="pt-3 mt-3 border-t border-border space-y-2">
            {user ? (
              <Button variant="outline" size="sm" className="w-full" onClick={() => { handleSignOut(); setMobileOpen(false); }}>
                Sign out
              </Button>
            ) : (
              <>
                <Link href="/sign-in" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full">Sign in</Button>
                </Link>
                <Link href="/sign-up" onClick={() => setMobileOpen(false)}>
                  <Button size="sm" className="w-full font-semibold">Get API Key</Button>
                </Link>
              </>
            )}
          </div>
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
