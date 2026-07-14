import React, { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { AdminNav } from "@/components/admin/AdminNav";
import {
  usePlatformApiKeys,
  usePlatformUsers,
  usePlatformUsageDaily,
  usePauseApiKey,
  useUnpauseApiKey,
  useSetApiKeyActive,
  type PlatformApiKey,
  type PlatformUser,
  type PlatformUsageDay,
} from "@/lib/adminApi";
import { Pause, Play, Ban, RotateCcw, Users, KeyRound, X } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-5">
      <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-2">{label}</p>
      <p className="text-3xl font-light tracking-tight">{value}</p>
    </div>
  );
}

const PAUSE_PRESETS = [
  { label: "15 min", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "24 hours", minutes: 60 * 24 },
  { label: "7 days", minutes: 60 * 24 * 7 },
];

function PauseMenu({ keyId, onClose }: { keyId: number; onClose: () => void }) {
  const pause = usePauseApiKey();
  const [customMinutes, setCustomMinutes] = useState("");

  return (
    <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-xl bg-[#181818] border border-white/10 shadow-xl p-2">
      {PAUSE_PRESETS.map((p) => (
        <button
          key={p.minutes}
          onClick={() => { pause.mutate({ id: keyId, minutes: p.minutes }); onClose(); }}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors"
        >
          Pause for {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5 px-1 pt-1.5 mt-1 border-t border-white/10">
        <input
          type="number"
          min={1}
          placeholder="Custom min"
          value={customMinutes}
          onChange={(e) => setCustomMinutes(e.target.value)}
          className="w-full min-w-0 bg-white/[0.06] rounded-lg px-2 py-1.5 text-xs text-white/80 placeholder:text-white/25 outline-none"
        />
        <button
          onClick={() => {
            const m = Number(customMinutes);
            if (m > 0) { pause.mutate({ id: keyId, minutes: m }); onClose(); }
          }}
          className="shrink-0 px-2.5 py-1.5 rounded-lg bg-white text-black text-xs font-medium hover:bg-white/90"
        >
          Go
        </button>
      </div>
    </div>
  );
}

function ApiKeyRow({ k }: { k: PlatformApiKey }) {
  const unpause = useUnpauseApiKey();
  const setActive = useSetApiKeyActive();
  const [showPauseMenu, setShowPauseMenu] = useState(false);

  const status = !k.isActive
    ? { label: "Revoked", color: "text-red-400 bg-red-400/10" }
    : k.isPaused
    ? { label: "Paused", color: "text-amber-400 bg-amber-400/10" }
    : { label: "Active", color: "text-emerald-400 bg-emerald-400/10" };

  return (
    <div className="grid grid-cols-[1.4fr_1fr_0.7fr_0.8fr_0.8fr_0.8fr_auto] gap-x-4 items-center px-5 py-3.5 relative">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{k.name}</p>
        <p className="text-xs text-white/35 truncate">{k.ownerEmail}</p>
      </div>
      <p className="text-xs font-mono text-white/50 truncate">{k.prefix}…</p>
      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md w-fit ${status.color}`}>
        {status.label}
      </span>
      <p className="text-sm text-white/60">{formatTokens(k.tokens30d)} <span className="text-white/25 text-xs">/30d</span></p>
      <p className="text-sm text-white/60">{formatTokens(k.tokensLifetime)} <span className="text-white/25 text-xs">life</span></p>
      <p className="text-xs text-white/35">{timeAgo(k.lastUsedAt)}</p>

      <div className="flex items-center gap-1.5 justify-end relative">
        {k.isPaused ? (
          <button
            onClick={() => unpause.mutate(k.id)}
            title="Unpause now"
            className="p-1.5 rounded-lg text-amber-400 hover:bg-white/[0.08]"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
        ) : (
          k.isActive && (
            <button
              onClick={() => setShowPauseMenu((v) => !v)}
              title="Pause temporarily"
              className="p-1.5 rounded-lg text-white/50 hover:bg-white/[0.08] hover:text-white"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          )
        )}
        {k.isActive ? (
          <button
            onClick={() => setActive.mutate({ id: k.id, active: false })}
            title="Revoke"
            className="p-1.5 rounded-lg text-white/50 hover:bg-red-400/10 hover:text-red-400"
          >
            <Ban className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={() => setActive.mutate({ id: k.id, active: true })}
            title="Reactivate"
            className="p-1.5 rounded-lg text-white/50 hover:bg-emerald-400/10 hover:text-emerald-400"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        {showPauseMenu && <PauseMenu keyId={k.id} onClose={() => setShowPauseMenu(false)} />}
      </div>
    </div>
  );
}

const USAGE_RANGES = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function UsageChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111] rounded-xl px-3 py-2.5 shadow-2xl text-xs">
      <p className="text-white/40 font-mono mb-1.5 uppercase tracking-wider text-[10px]">{label}</p>
      <p className="text-white font-medium">{payload[0].value.toLocaleString()} tokens</p>
      <p className="text-white/40 mt-0.5">{payload[0].payload.requests.toLocaleString()} requests · all developers combined</p>
    </div>
  );
}

export default function AdminPlatform() {
  const { data: keysData, isLoading: keysLoading } = usePlatformApiKeys();
  const { data: usersData, isLoading: usersLoading } = usePlatformUsers();
  const [usageDays, setUsageDays] = useState(30);
  const { data: usageDaily, isLoading: usageLoading } = usePlatformUsageDaily(usageDays);
  const [tab, setTab] = useState<"keys" | "users">("keys");
  const [search, setSearch] = useState("");

  const keys = keysData?.keys ?? [];
  const users = usersData?.users ?? [];
  const chartData = (usageDaily?.series ?? []).map((d: PlatformUsageDay) => ({
    ...d,
    date: format(parseISO(d.date), "MMM dd"),
  }));

  const filteredKeys = keys
    .filter(
      (k: PlatformApiKey) => !search || k.name.toLowerCase().includes(search.toLowerCase()) || k.ownerEmail.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a: PlatformApiKey, b: PlatformApiKey) => b.tokens30d - a.tokens30d);
  const filteredUsers = users.filter((u: PlatformUser) => !search || u.email.toLowerCase().includes(search.toLowerCase()));

  const activeCount = keys.filter((k: PlatformApiKey) => k.isActive && !k.isPaused).length;
  const pausedCount = keys.filter((k: PlatformApiKey) => k.isPaused).length;

  return (
    <AppLayout title="Admin">
      <AdminNav />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Developers" value={usersLoading ? "—" : users.length} />
        <StatCard label="Total API Keys" value={keysLoading ? "—" : keys.length} />
        <StatCard label="Active Keys" value={keysLoading ? "—" : activeCount} />
        <StatCard label="Paused Keys" value={keysLoading ? "—" : pausedCount} />
      </div>

      <div className="rounded-2xl bg-white/[0.03] p-5 mb-8">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-2">
              Combined Token Usage — every developer, all keys
            </p>
            <p className="text-3xl font-light">
              {usageLoading ? "—" : (usageDaily?.totalTokens ?? 0).toLocaleString()}
              <span className="text-sm text-white/30 font-mono ml-2">/ {usageDays}d</span>
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1">
            {USAGE_RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setUsageDays(r.days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${usageDays === r.days ? "bg-white text-black" : "text-white/50 hover:text-white"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-56 w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="platformTokGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fff" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#fff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={10}
                tickLine={false} axisLine={false} dy={8}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
              />
              <Tooltip content={<UsageChartTooltip />} />
              <Area
                type="monotone" dataKey="tokens" stroke="#ffffff" strokeWidth={1.5}
                fillOpacity={1} fill="url(#platformTokGrad)" animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1">
          <button
            onClick={() => setTab("keys")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "keys" ? "bg-white text-black" : "text-white/50 hover:text-white"}`}
          >
            <KeyRound className="w-3.5 h-3.5" /> API Keys
          </button>
          <button
            onClick={() => setTab("users")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "users" ? "bg-white text-black" : "text-white/50 hover:text-white"}`}
          >
            <Users className="w-3.5 h-3.5" /> Developers
          </button>
        </div>
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "keys" ? "Search by key name or owner email…" : "Search by email…"}
            className="w-64 max-w-full bg-white/[0.05] rounded-xl px-3.5 py-2 text-sm outline-none placeholder:text-white/25 focus:bg-white/[0.08]"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {tab === "keys" ? (
        <div className="rounded-2xl bg-white/[0.03] overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1fr_0.7fr_0.8fr_0.8fr_0.8fr_auto] gap-x-4 px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-white/25">
            <span>Key / Owner</span>
            <span>Prefix</span>
            <span>Status</span>
            <span>Tokens</span>
            <span>Lifetime</span>
            <span>Last Used</span>
            <span />
          </div>
          <div className="divide-y divide-white/[0.06]">
            {keysLoading ? (
              <div className="px-5 py-8 text-center text-sm text-white/30">Loading…</div>
            ) : filteredKeys.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-white/40">No API keys found.</div>
            ) : (
              filteredKeys.map((k: PlatformApiKey) => <ApiKeyRow key={k.id} k={k} />)
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white/[0.03] overflow-hidden">
          <div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr_0.8fr_1fr] gap-x-4 px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-white/25">
            <span>Developer</span>
            <span>Keys</span>
            <span>Active</span>
            <span>Tokens (30d)</span>
            <span>Lifetime</span>
            <span>First Key</span>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {usersLoading ? (
              <div className="px-5 py-8 text-center text-sm text-white/30">Loading…</div>
            ) : filteredUsers.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-white/40">No developers found.</div>
            ) : (
              filteredUsers.map((u: PlatformUser) => (
                <div key={u.userId} className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr_0.8fr_1fr] gap-x-4 items-center px-5 py-3.5">
                  <p className="text-sm truncate">{u.email}</p>
                  <p className="text-sm text-white/60">{u.totalKeys}</p>
                  <p className="text-sm text-white/60">{u.activeKeys}{u.pausedKeys > 0 && <span className="text-amber-400 ml-1 text-xs">({u.pausedKeys} paused)</span>}</p>
                  <p className="text-sm text-white/60">{formatTokens(u.tokens30d)}</p>
                  <p className="text-sm text-white/60">{formatTokens(u.tokensLifetime)}</p>
                  <p className="text-xs text-white/35">{new Date(u.oldestKeyAt).toLocaleDateString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
