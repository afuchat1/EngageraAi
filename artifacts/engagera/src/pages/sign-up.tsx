import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import PublicLayout from "@/components/layout/PublicLayout";
import { logoSrc } from "@/lib/assets";
import { useSEO } from "@/hooks/useSEO";

export default function SignUp() {
  useSEO({
    title: "Sign Up — Engagera | AfuAI",
    description: "Create a free Engagera account to chat with leading AI models, get API keys, and track usage.",
    path: "/sign-up",
  });
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const { signUp } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await signUp(email, password);
    if (authError) {
      setError(authError.message);
      setLoading(false);
    } else {
      setDone(true);
    }
  };

  return (
    <PublicLayout>
      <div className="flex flex-col items-center justify-center min-h-full px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <img src={logoSrc} alt="Engagera" className="w-10 h-10 rounded-xl mb-4" />
            <h1 className="text-xl font-semibold tracking-tight">Create an account</h1>
            <p className="text-sm text-white/40 mt-1">Start using Engagera for free</p>
          </div>

          {done ? (
            <div className="rounded-2xl bg-white/[0.04] p-6 text-center">
              <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center mx-auto mb-4">
                <span className="text-lg">✓</span>
              </div>
              <p className="text-sm font-medium mb-1">Check your email</p>
              <p className="text-xs text-white/40">
                We've sent a confirmation link to <strong className="text-white/70">{email}</strong>. Click it to
                activate your account.
              </p>
              <button
                onClick={() => {
                  const returnTo = new URLSearchParams(window.location.search).get("returnTo");
                  setLocation(returnTo ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : "/sign-in");
                }}
                className="mt-5 w-full py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 transition-colors"
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-white/[0.04] p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-white/80">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-white/50 font-mono uppercase tracking-wider" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/[0.05] rounded-xl text-sm outline-none focus:bg-white/[0.08] transition-colors placeholder:text-white/20"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-white/50 font-mono uppercase tracking-wider" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/[0.05] rounded-xl text-sm outline-none focus:bg-white/[0.08] transition-colors"
                    placeholder="At least 8 characters"
                    minLength={8}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 disabled:opacity-50 transition-colors mt-1"
                >
                  {loading ? "Creating account…" : "Create account"}
                </button>

                <p className="text-[11px] text-white/25 text-center leading-relaxed">
                  By continuing you agree to our Terms of Service and Privacy Policy.
                </p>
              </form>
            </div>
          )}

          <p className="text-center text-sm text-white/40 mt-5">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-white hover:underline underline-offset-4 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
