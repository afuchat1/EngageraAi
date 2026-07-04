import React, { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import PublicLayout from "@/components/layout/PublicLayout";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
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
      <div className="max-w-md mx-auto mt-20 p-6 border border-white/15">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Reset Password</h1>
          <p className="text-white/60 text-sm">Enter your email and we'll send you a recovery link.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {status === "error" && message && (
            <div className="p-3 border border-white/20 bg-white/5 text-sm">
              {message}
            </div>
          )}

          {status === "success" && message && (
            <div className="p-3 border border-white/30 bg-white/10 text-sm">
              {message}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "success"}
              className="w-full px-3 py-2 bg-transparent border border-white/20 focus:border-white outline-none transition-colors disabled:opacity-50"
              required
            />
          </div>

          <button
            type="submit"
            disabled={status === "loading" || status === "success"}
            className="w-full py-2 px-4 bg-white text-black font-medium hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === "loading" ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-white/60">
          Remember your password?{" "}
          <Link href="/sign-in" className="text-white hover:underline underline-offset-4">
            Sign in
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
