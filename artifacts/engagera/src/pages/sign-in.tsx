import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import PublicLayout from "@/components/layout/PublicLayout";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
      <div className="max-w-md mx-auto mt-20 p-6 border border-white/15">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Sign In</h1>
          <p className="text-white/60 text-sm">Enter your credentials to access your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 border border-white/20 bg-white/5 text-sm">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-transparent border border-white/20 focus:border-white outline-none transition-colors"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium" htmlFor="password">Password</label>
              <Link href="/forgot-password" className="text-xs text-white/60 hover:text-white">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-transparent border border-white/20 focus:border-white outline-none transition-colors"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-white text-black font-medium hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-white/60">
          Don't have an account?{" "}
          <Link href="/sign-up" className="text-white hover:underline underline-offset-4">
            Sign up
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
