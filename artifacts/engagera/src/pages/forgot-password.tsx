import React, { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const { resetPasswordForEmail } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await resetPasswordForEmail(email);
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      toast({
        title: "Could not send reset email",
        description: err.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left branding panel */}
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

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-2">
            <img src="/logo.png" alt="Engagera" className="h-7 w-7 object-contain" />
            <span className="font-bold tracking-tight">Engagera</span>
          </div>

          {sent ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <CheckCircle className="h-14 w-14 text-emerald-500" strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
                <p className="text-sm text-muted-foreground">
                  We sent a password reset link to{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                  Click the link in that email to create a new password.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Didn't receive it?{" "}
                <button
                  onClick={() => setSent(false)}
                  className="font-medium text-foreground hover:underline underline-offset-4"
                >
                  Try again
                </button>
              </p>
              <Link
                href="/sign-in"
                className="block text-sm font-medium text-foreground hover:underline underline-offset-4"
              >
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
                <p className="text-sm text-muted-foreground">
                  Enter your email address and we'll send you a link to reset your password.
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

                <Button type="submit" className="w-full h-10 font-semibold" disabled={isSubmitting}>
                  {isSubmitting ? "Sending…" : "Send reset link"}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Remember your password?{" "}
                <Link href="/sign-in" className="font-medium text-foreground hover:underline underline-offset-4">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
