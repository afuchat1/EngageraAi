import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signIn } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await signIn(email, password);
      if (error) throw error;
      setLocation("/dashboard");
    } catch (err: any) {
      toast({ title: "Sign in failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 border-r border-border bg-card">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="Engagera" className="h-8 w-8 object-contain" />
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

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-2">
            <img src="/logo.png" alt="Engagera" className="h-7 w-7 object-contain" />
            <span className="font-bold tracking-tight">Engagera</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-10"
              />
            </div>

            <Button type="submit" className="w-full h-10 font-semibold" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/sign-up" className="font-medium text-foreground hover:underline underline-offset-4">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
