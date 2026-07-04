import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import PublicLayout from "@/components/layout/PublicLayout";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
      // Typically wait for confirmation or redirect
      setLocation("/dashboard");
    }
  };

  return (
    <PublicLayout>
      <div className="max-w-md mx-auto mt-20 p-6 border border-white/15">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Create an Account</h1>
          <p className="text-white/60 text-sm">Sign up for an API key and start building.</p>
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
            <label className="block text-sm font-medium" htmlFor="password">Password</label>
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
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-white/60">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-white hover:underline underline-offset-4">
            Sign in
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
