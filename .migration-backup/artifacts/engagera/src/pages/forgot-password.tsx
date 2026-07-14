import React, { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import PublicLayout from "@/components/layout/PublicLayout";
import { logoSrc } from "@/lib/assets";

export default function ForgotPassword() {
  const [email, setEmail]   = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const { resetPasswordForEmail } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);
    const { error } = await resetPasswordForEmail(email);
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("success");
      setMessage("If an account exists with this email, a reset link has been sent.");
    }
  };

  return (
    <PublicLayout>
      <div className="flex flex-col items-center justify-center min-h-full px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <img src={logoSrc} alt="Engagera" className="w-10 h-10 rounded-xl mb-4" />
            <h1 className="text-xl font-semibold tracking-tight">Reset password</h1>
            <p className="text-sm text-white/40 mt-1">We'll send a recovery link to your email</p>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {status === "error" && message && (
                <div className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-white/80">{message}</div>
              )}
              {status === "success" && message && (
                <div className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-white/80">{message}</div>
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
                  disabled={status === "success"}
                  className="w-full px-3 py-2.5 bg-white/[0.05] rounded-xl text-sm outline-none focus:bg-white/[0.08] transition-colors disabled:opacity-50 placeholder:text-white/20"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={status === "loading" || status === "success"}
                className="w-full py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 disabled:opacity-50 transition-colors"
              >
                {status === "loading" ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-white/40 mt-5">
            Remember your password?{" "}
            <Link href="/sign-in" className="text-white hover:underline underline-offset-4 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
