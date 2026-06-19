import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { logoSrc } from "@/lib/assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Check } from "lucide-react";

const perks = [
  "Unlimited conversations",
  "API key access to all models",
  "Usage analytics dashboard",
  "Priority response times",
];

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signUp } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await signUp(email, password);
      if (error) throw error;
      const returnTo = sessionStorage.getItem("engagera_return_to");
      sessionStorage.removeItem("engagera_return_to");
      setLocation(returnTo || "/dashboard");
    } catch (err: any) {
      toast({ title: "Sign up failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 border-r border-border bg-card">
        <Link href="/" className="flex items-center gap-3">
          <img src={logoSrc} alt="Engagera" className="h-8 w-8 object-contain" />
          <span className="font-bold text-lg tracking-tight">Engagera</span>
        </Link>
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">Everything you need to ship with AI</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Get started in minutes with a single API key that unlocks every model on the platform.
            </p>
          </div>
          <ul className="space-y-3">
            {perks.map((perk) => (
              <li key={perk} className="flex items-center gap-3 text-sm">
                <div className="h-5 w-5 rounded-full bg-foreground/10 border border-foreground/20 flex items-center justify-center shrink-0">
                  <Check className="h-3 w-3 text-foreground" />
                </div>
                <span className="text-foreground/80">{perk}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground/50">© {new Date().getFullYear()} Engagera. All rights reserved.</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-2">
            <img src={logoSrc} alt="Engagera" className="h-7 w-7 object-contain" />
            <span className="font-bold tracking-tight">Engagera</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
            <p className="text-sm text-muted-foreground">Free forever. No credit card required.</p>
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
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="h-10"
              />
            </div>

            <Button type="submit" className="w-full h-10 font-semibold" disabled={isSubmitting}>
              {isSubmitting ? "Creating account…" : "Create free account"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-foreground hover:underline underline-offset-4">
              Sign in
            </Link>
          </p>

          <p className="text-center text-xs text-muted-foreground/50 leading-relaxed">
            By signing up, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
