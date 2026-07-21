import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { logoSrc } from "@/lib/assets";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Menu, X, LogOut, Settings } from "lucide-react";

export function Navbar() {
  const { user, avatarUrl, displayName, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    setProfileOpen(false);
    await signOut();
    setLocation("/");
  };

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-center px-4 md:px-8 max-w-screen-xl mx-auto">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 mr-8 shrink-0">
          <img src={logoSrc} alt="Engagera" className="h-7 w-7 object-contain" />
          <span className="font-bold tracking-tight text-base text-foreground">Engagera</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium flex-1">
          <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors">
            Docs
          </Link>
          <Link href="/generate" className="text-muted-foreground hover:text-foreground transition-colors">
            Generate
          </Link>
          {user && (
            <Link href="/usage" className="text-muted-foreground hover:text-foreground transition-colors">
              Usage
            </Link>
          )}
        </nav>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-2 ml-auto">
          {user ? (
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Profile menu"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName ?? "Profile"}
                    className="h-8 w-8 rounded-full object-cover border border-border"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-primary/20 border border-border flex items-center justify-center text-xs font-semibold text-primary">
                    {displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "U"}
                  </div>
                )}
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-popover shadow-lg py-1.5 z-50">
                  <div className="px-4 py-2.5 border-b border-border mb-1">
                    <p className="text-sm font-medium truncate">{displayName ?? user.email}</p>
                    {displayName && (
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    )}
                  </div>
                  <Link href="/dashboard" onClick={() => setProfileOpen(false)}>
                    <div className="flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-accent cursor-pointer transition-colors">
                      Dashboard
                    </div>
                  </Link>
                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
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
          <MobileNavLink href="/docs"      onClick={() => setMobileOpen(false)}>Docs</MobileNavLink>
          <MobileNavLink href="/generate" onClick={() => setMobileOpen(false)}>Generate</MobileNavLink>
          {user && (
            <>
              <MobileNavLink href="/dashboard" onClick={() => setMobileOpen(false)}>Dashboard</MobileNavLink>
              <MobileNavLink href="/usage"     onClick={() => setMobileOpen(false)}>Usage</MobileNavLink>
            </>
          )}
          <div className="pt-3 mt-3 border-t border-border space-y-2">
            {user ? (
              <>
                {/* User info row */}
                <div className="flex items-center gap-3 px-3 py-2">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover border border-border" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                      {displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "U"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{displayName ?? user.email}</p>
                    {displayName && <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>}
                  </div>
                </div>
                {/* Settings — logout tucked here */}
                <button
                  onClick={() => { handleSignOut(); setMobileOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </>
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
