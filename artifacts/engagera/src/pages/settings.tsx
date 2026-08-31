import React, { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useConfirm } from "@/hooks/useConfirm";
import { Bell, ChevronDown, Database, KeyRound, LogOut, Shield, Sparkles, User } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4 font-mono">{title}</h2>
      {children}
    </div>
  );
}

function SettingRow({
  icon: Icon, label, description, action,
}: {
  icon: React.ElementType; label: string; description?: string; action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-4 h-4 text-white/50" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          {description && <p className="text-xs text-white/40 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="ml-4 shrink-0">{action}</div>
    </div>
  );
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const [emailNotifs, setEmailNotifs] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleSignOut = async () => {
    const ok = await confirm({
      title: "Sign out",
      description: "You'll be redirected to the sign-in page.",
      confirmLabel: "Sign out",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    await signOut();
    setLocation("/sign-in");
  };

  return (
    <AppLayout title="Settings">
      <div className="max-w-xl">

        <Section title="Quick access">
          <div className="rounded-2xl bg-white/[0.03] divide-y divide-white/[0.07] px-4">
            <SettingRow
              icon={User}
              label="Email address"
              description={user?.email ?? "—"}
              action={
                <span className="text-[10px] uppercase font-mono text-white/25 tracking-wider px-2.5 py-1 bg-white/[0.05] rounded-full">
                  Verified
                </span>
              }
            />
            <SettingRow
              icon={Bell}
              label="Email notifications"
              description="Usage alerts and product updates"
              action={
                <button
                  onClick={() => setEmailNotifs((v) => !v)}
                  aria-label={emailNotifs ? "Disable email notifications" : "Enable email notifications"}
                  className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${
                    emailNotifs ? "bg-white" : "bg-white/20"
                  }`}
                  style={{ width: 40, height: 22 }}
                >
                  <span
                    className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-black transition-transform duration-200 ${
                      emailNotifs ? "translate-x-[20px]" : "translate-x-[2px]"
                    }`}
                  />
                </button>
              }
            />
            <SettingRow
              icon={Shield}
              label="Advanced settings"
              description="Personalization, privacy, and account controls"
              action={
                <button
                  onClick={() => setAdvancedOpen((open) => !open)}
                  aria-expanded={advancedOpen}
                  aria-label={advancedOpen ? "Hide advanced settings" : "Show advanced settings"}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white/60 hover:text-white rounded-xl hover:bg-white/[0.07] transition-colors"
                >
                  {advancedOpen ? "Hide" : "Open"}
                  <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                </button>
              }
            />
          </div>
        </Section>

        {advancedOpen && (
          <>
            <div className="mb-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <div className="flex items-start gap-3">
                <Shield className="w-4 h-4 text-white/40 mt-0.5 shrink-0" />
                <p className="text-xs leading-relaxed text-white/40">
                  These controls affect privacy, account access, and how Engagera personalizes responses.
                  Review them carefully before making changes.
                </p>
              </div>
            </div>

            <Section title="AI & personalization">
              <div className="rounded-2xl bg-white/[0.03] divide-y divide-white/[0.07] px-4">
                <SettingRow
                  icon={Sparkles}
                  label="Cross-chat memory"
                  description="Engagera uses relevant details from your own saved memories and previous conversations."
                  action={
                    <span className="text-[10px] uppercase font-mono text-white/40 tracking-wider px-2.5 py-1 bg-white/[0.05] rounded-full">
                      Active
                    </span>
                  }
                />
                <SettingRow
                  icon={Database}
                  label="Conversation context"
                  description="Only relevant excerpts are selected for a new chat; your full archive is never sent."
                  action={
                    <span className="text-[10px] uppercase font-mono text-white/25 tracking-wider">
                      Private
                    </span>
                  }
                />
              </div>
            </Section>

            <Section title="Privacy & data">
              <div className="rounded-2xl bg-white/[0.03] divide-y divide-white/[0.07] px-4">
                <SettingRow
                  icon={Database}
                  label="Conversation history"
                  description="Review or delete saved chats from the history panel."
                  action={
                    <button
                      onClick={() => setLocation("/")}
                      className="text-sm text-white/60 hover:text-white underline underline-offset-4 transition-colors"
                    >
                      Open Chat
                    </button>
                  }
                />
              </div>
            </Section>

            <Section title="Security & access">
              <div className="rounded-2xl bg-white/[0.03] divide-y divide-white/[0.07] px-4">
                <SettingRow
                  icon={KeyRound}
                  label="API keys"
                  description="Create and revoke developer keys from the Dashboard."
                  action={
                    <button
                      onClick={() => setLocation("/dashboard")}
                      className="text-sm text-white/60 hover:text-white underline underline-offset-4 transition-colors"
                    >
                      Dashboard
                    </button>
                  }
                />
                <SettingRow
                  icon={LogOut}
                  label="Sign out"
                  description="Sign out of your account on this device."
                  action={
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-red-400/30 text-red-300 rounded-xl hover:bg-red-400/10 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign out
                    </button>
                  }
                />
              </div>
            </Section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
