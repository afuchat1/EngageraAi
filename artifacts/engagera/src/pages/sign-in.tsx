import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import PublicLayout from "@/components/layout/PublicLayout";
import { logoSrc } from "@/lib/assets";
import { useSEO } from "@/hooks/useSEO";

export default function SignIn() {
  useSEO({
    title: "Sign In — Engagera | AfuAI",
    description: "Sign in to your Engagera account to chat, manage API keys, and track usage.",
    path: "/sign-in",
  });
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const { signIn } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await signIn(email, password);
    if (authError) {
      setError(authError.message);
      setLoading(false);
    } else {
      setLocation("/dashboard");
    }
  };

  return (
    <PublicLayout>
      <div className="flex flex-col items-center justify-center min-h-full px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <img src={logoSrc} alt="Engagera" className="w-10 h-10 rounded-xl mb-4" />
            <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-sm text-white/40 mt-1">Sign in to your account</p>
          </div>

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
                <div className="flex items-center justify-between">
                  <label className="text-xs text-white/50 font-mono uppercase tracking-wider" htmlFor="password">
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-xs text-white/40 hover:text-white transition-colors">
                    Forgot?
                  </Link>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/[0.05] rounded-xl text-sm outline-none focus:bg-white/[0.08] transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 disabled:opacity-50 transition-colors mt-1"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-white/40 mt-5">
            Don't have an account?{" "}
            <a
              href="https://web.afuchat.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:underline underline-offset-4 transition-colors"
            >
              Create one at web.afuchat.com
            </a>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
