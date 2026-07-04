import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import PublicLayout from "@/components/layout/PublicLayout";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const { updatePassword } = useAuth();
  const [, setLocation] = useLocation();

  // If there's a hash, supabase client typically picks it up automatically on mount.
  // Then we can just call updateUser.

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
      setMessage("Password successfully updated. Redirecting to dashboard...");
      setTimeout(() => setLocation("/dashboard"), 2000);
    }
  };

  return (
    <PublicLayout>
      <div className="max-w-md mx-auto mt-20 p-6 border border-white/15">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Set New Password</h1>
          <p className="text-white/60 text-sm">Enter your new password below.</p>
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
            <label className="block text-sm font-medium" htmlFor="password">New Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {status === "loading" ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </PublicLayout>
  );
}
