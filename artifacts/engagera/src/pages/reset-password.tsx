import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { logoSrc } from "@/lib/assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { CheckCircle, Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  const { updatePassword } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when the user arrives via the reset link.
    // The token is in the URL hash and Supabase picks it up automatically.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setSessionReady(true);
      } else if (event === "SIGNED_IN" && session) {
        // Already signed in with recovery token
        setSessionReady(true);
      }
    });

    // Also check if there's already an active recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    // If no session arrives within 5 seconds, the link was invalid / expired
    const timeout = setTimeout(() => {
      setTokenError(true);
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // Clear the timeout if session becomes ready
  useEffect(() => {
    if (sessionReady) setTokenError(false);
  }, [sessionReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", description: "Please make sure both fields are identical.", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await updatePassword(password);
      if (error) throw error;
      setDone(true);
      // Redirect to dashboard after 2 seconds
      setTimeout(() => setLocation("/dashboard"), 2000);
    } catch (err: any) {
      toast({ title: "Could not update password", description: err.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 border-r border-border bg-card">
        <Link href="/" className="flex items-center gap-3">
          <img src={logoSrc} alt="Engagera" className="h-8 w-8 object-contain" />
          <span className="font-bold text-lg tracking-tight">Engagera</span>
        </Link>
        <div className="space-y-6">
          <blockquote className="text-2xl font-semibold tracking-tight leading-snug text-foreground/90">
            "One platform. Every model.<br />Zero complexity."
          </blockquote>
          <p className="text-sm text-muted-foreground">
            Access the world's most capable AI models through a single, unified API.
          </p>
        </div>
        <p className="text-xs text-muted-foreground/50">© {new Date().getFullYear()} Engagera. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-2">
            <img src={logoSrc} alt="Engagera" className="h-7 w-7 object-contain" />
            <span className="font-bold tracking-tight">Engagera</span>
          </div>

          {done ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <CheckCircle className="h-14 w-14 text-emerald-500" strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Password updated</h1>
                <p className="text-sm text-muted-foreground">
                  Your password has been changed successfully. Redirecting you to your dashboard…
                </p>
              </div>
            </div>
          ) : !sessionReady && tokenError ? (
            <div className="space-y-6 text-center">
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Link expired</h1>
                <p className="text-sm text-muted-foreground">
                  This password reset link is invalid or has expired.
                  Reset links are valid for 1 hour.
                </p>
              </div>
              <Link
                href="/forgot-password"
                className="inline-block w-full"
              >
                <Button className="w-full h-10 font-semibold">
                  Request a new link
                </Button>
              </Link>
              <Link
                href="/sign-in"
                className="block text-sm font-medium text-foreground hover:underline underline-offset-4"
              >
                ← Back to sign in
              </Link>
            </div>
          ) : !sessionReady ? (
            <div className="space-y-4 text-center">
              <div className="h-8 w-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Verifying your reset link…</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Create new password</h1>
                <p className="text-sm text-muted-foreground">
                  Choose a strong password for your Engagera account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">New password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm" className="text-sm font-medium">Confirm password</Label>
                  <Input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="h-10"
                  />
                  {confirm && password !== confirm && (
                    <p className="text-xs text-destructive">Passwords don't match</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 font-semibold"
                  disabled={isSubmitting || (!!confirm && password !== confirm)}
                >
                  {isSubmitting ? "Updating…" : "Update password"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
