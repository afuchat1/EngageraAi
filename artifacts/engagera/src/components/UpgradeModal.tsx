import { Link } from "wouter";
import { Sparkles, Zap, Brain, Globe, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  countdown?: string;
  reason?: "limit" | "wall";
}

const perks = [
  { icon: Zap,     text: "Unlimited messages, no daily cap" },
  { icon: Brain,   text: "Persistent memory across all sessions" },
  { icon: Globe,   text: "Deep research with live web data" },
  { icon: Sparkles,text: "API access & developer dashboard" },
];

export function UpgradeModal({ open, onClose, countdown, reason = "limit" }: UpgradeModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#111] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Gradient strip */}
        <div className="h-1 w-full bg-gradient-to-r from-violet-600 via-blue-500 to-violet-600" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 py-6">
          {/* Logo + heading */}
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <img src="/logo.png" alt="" className="h-5 w-5 object-contain" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground leading-tight">
                {reason === "limit" ? "You've used your free messages" : "Create a free account"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {countdown
                  ? `Free messages reset in ${countdown} — or sign up now for unlimited access.`
                  : "Sign up free to unlock the full Engagera intelligence system."}
              </p>
            </div>
          </div>

          {/* Perks */}
          <ul className="space-y-2 mb-6">
            {perks.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-3 w-3 text-primary" />
                </div>
                {text}
              </li>
            ))}
          </ul>

          {/* CTAs */}
          <div className="flex flex-col gap-2">
            <Link href="/sign-up">
              <Button className="w-full font-semibold text-sm h-10 bg-primary hover:bg-primary/90">
                Create free account
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="ghost" className="w-full text-sm h-9 text-muted-foreground hover:text-foreground">
                Sign in to existing account
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
