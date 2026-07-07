import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import PublicLayout from "@/components/layout/PublicLayout";
import { logoSrc } from "@/lib/assets";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [status, setStatus]     = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage]   = useState<string | null>(null);
  const { updatePassword } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);
    const { error } = await updatePassword(password);
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("success");
      setMessage("Password updated. Redirecting…");
      setTimeout(() => setLocation("/dashboard"), 2000);
    }
  };

  return (
    <PublicLayout>
      <div className="flex flex-col items-center justify-center min-h-full px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <img src={logoSrc} alt="Engagera" className="w-10 h-10 rounded-xl mb-4" />
            <h1 className="text-xl font-semibold tracking-tight">Set new password</h1>
            <p className="text-sm text-white/40 mt-1">Choose a strong password for your account</p>
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
                <label className="text-xs text-white/50 font-mono uppercase tracking-wider" htmlFor="password">
                  New Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={status === "success"}
                  className="w-full px-3 py-2.5 bg-white/[0.05] rounded-xl text-sm outline-none focus:bg-white/[0.08] transition-colors disabled:opacity-50"
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={status === "loading" || status === "success"}
                className="w-full py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 disabled:opacity-50 transition-colors"
              >
                {status === "loading" ? "Updating…" : "Update password"}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-white/40 mt-5">
            <Link href="/sign-in" className="text-white hover:underline underline-offset-4 transition-colors">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
