import React, { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { StreakBadge } from "@/components/StreakBadge";
import {
  useListApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useGetDashboardStats,
} from "@workspace/api-client-react";
import { useDeleteApiKeyPermanently } from "@/lib/adminApi";
import { Copy, Plus, Check, Key, Activity, Zap, MoreHorizontal, Ban, Trash2 } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { useAlert } from "@/hooks/useAlert";

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-5 flex items-start justify-between">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-2">{label}</p>
        <p className="text-3xl font-light tracking-tight">{value}</p>
      </div>
      <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-white/40" />
      </div>
    </div>
  );
}

interface KeyMenuProps {
  keyId: number;
  onRevoke: () => void;
  onDelete: () => void;
}

function KeyMenu({ keyId, onRevoke, onDelete }: KeyMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 text-white/30 hover:text-white hover:bg-white/[0.07] rounded-lg transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-40 bg-[#111] rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
            <button
              onClick={() => { setOpen(false); onRevoke(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.07] transition-colors text-left"
            >
              <Ban className="w-3.5 h-3.5 shrink-0" />
              Revoke key
            </button>
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.07] transition-colors text-left"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              Delete permanently
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [newKeyName, setNewKeyName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const confirm = useConfirm();
  const alert = useAlert();

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: apiKeys = [], isLoading: keysLoading, refetch: refetchKeys } = useListApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const deleteKey = useDeleteApiKeyPermanently();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    createKey.mutate(
      { data: { name: newKeyName } },
      {
        onSuccess: (res) => {
          setCreatedSecret(res.key);
          setNewKeyName("");
          setShowCreate(false);
          refetchKeys();
        },
      },
    );
  };

  const handleRevoke = async (id: number, name: string) => {
    const ok = await confirm({
      title: `Revoke "${name}"?`,
      description:
        "This key will be disabled immediately. Requests using it will start failing. The record stays visible in your dashboard.",
      confirmLabel: "Revoke",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    revokeKey.mutate(
      { id },
      {
        onSuccess: () => {
          refetchKeys();
          alert("Key revoked successfully.", "success");
        },
        onError: () => alert("Failed to revoke key.", "error"),
      },
    );
  };

  const handleDelete = async (id: number, name: string) => {
    const ok = await confirm({
      title: `Delete "${name}" permanently?`,
      description:
        "This will permanently remove the key and all associated records. This cannot be undone.",
      confirmLabel: "Delete permanently",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    deleteKey.mutate(id, {
      onSuccess: () => {
        refetchKeys();
        alert("Key deleted permanently.", "success");
      },
      onError: () => alert("Failed to delete key.", "error"),
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppLayout title="Dashboard">

      {/* Streak */}
      <div className="mb-6">
        <StreakBadge />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Total Requests"
          icon={Activity}
          value={statsLoading ? "—" : (stats?.totalRequests.toLocaleString() ?? "0")}
        />
        <StatCard
          label="Tokens This Month"
          icon={Zap}
          value={statsLoading ? "—" : (stats?.totalTokensThisMonth.toLocaleString() ?? "0")}
        />
        <StatCard
          label="Active Keys"
          icon={Key}
          value={statsLoading ? "—" : (stats?.activeKeys ?? "0")}
        />
      </div>

      {/* API Keys */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold tracking-tight">API Keys</h2>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-white text-black rounded-xl hover:bg-white/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create key
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="rounded-2xl bg-white/[0.04] p-5 mb-5">
            <p className="text-sm font-medium mb-3">New API key</p>
            <form onSubmit={handleCreate} className="flex gap-3">
              <input
                type="text"
                placeholder="Key name — e.g. Production"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="flex-1 px-3 py-2 bg-white/[0.05] rounded-xl text-sm outline-none focus:bg-white/[0.08] transition-colors placeholder:text-white/25"
                required
              />
              <button
                type="submit"
                disabled={createKey.isPending}
                className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 disabled:opacity-50 transition-colors"
              >
                {createKey.isPending ? "Generating…" : "Generate"}
              </button>
            </form>
          </div>
        )}

        {/* New key reveal */}
        {createdSecret && (
          <div className="rounded-2xl bg-white/[0.04] p-5 mb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold mb-1">Save your API key</p>
                <p className="text-xs text-white/40 mb-4">
                  This key won't be shown again. Store it somewhere safe.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-xl bg-white/[0.06] text-xs font-mono text-white/80 truncate">
                    {createdSecret}
                  </code>
                  <button
                    onClick={() => copyToClipboard(createdSecret)}
                    className="p-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] transition-colors shrink-0"
                    title="Copy key"
                  >
                    {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setCreatedSecret(null)}
                className="text-xs text-white/30 hover:text-white/60 transition-colors mt-0.5 shrink-0"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Keys table */}
        <div className="rounded-2xl bg-white/[0.03] overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-white/25">
            <span>Name</span>
            <span className="hidden sm:block">Prefix</span>
            <span className="hidden md:block">Created</span>
            <span className="hidden md:block">Last used</span>
            <span />
          </div>
          <div className="divide-y divide-white/[0.06]">
            {keysLoading ? (
              <div className="px-5 py-8 text-center text-sm text-white/30">Loading keys…</div>
            ) : apiKeys.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Key className="w-8 h-8 text-white/15 mx-auto mb-3" />
                <p className="text-sm text-white/40">No API keys yet.</p>
                <p className="text-xs text-white/25 mt-1">Create one to start using the Engagera API.</p>
              </div>
            ) : (
              apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-sm font-medium truncate">{key.name}</span>
                  <span className="hidden sm:block font-mono text-xs text-white/40">{key.prefix}•••</span>
                  <span className="hidden md:block text-xs text-white/40">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </span>
                  <span className="hidden md:block text-xs text-white/40">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                  </span>
                  <KeyMenu
                    keyId={key.id}
                    onRevoke={() => handleRevoke(key.id, key.name)}
                    onDelete={() => handleDelete(key.id, key.name)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
