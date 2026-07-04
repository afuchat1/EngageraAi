import React, { useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/layout/AppLayout";
import { 
  useListApiKeys, 
  useCreateApiKey, 
  useRevokeApiKey, 
  useGetDashboardStats 
} from "@workspace/api-client-react";
import { Copy, Plus, Trash2, Key, Check } from "lucide-react";

export default function Dashboard() {
  const [newKeyName, setNewKeyName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: apiKeys = [], isLoading: keysLoading, refetch: refetchKeys } = useListApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

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
        }
      }
    );
  };

  const handleRevoke = (id: number) => {
    if (confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      revokeKey.mutate({ id }, {
        onSuccess: () => refetchKeys()
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppLayout title="Dashboard">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-6 border border-white/15">
          <div className="text-white/60 text-xs uppercase tracking-wider mb-2 font-mono">Total Requests</div>
          <div className="text-3xl font-light">
            {statsLoading ? "..." : stats?.totalRequests.toLocaleString() || "0"}
          </div>
        </div>
        <div className="p-6 border border-white/15">
          <div className="text-white/60 text-xs uppercase tracking-wider mb-2 font-mono">Tokens (Month)</div>
          <div className="text-3xl font-light">
            {statsLoading ? "..." : stats?.totalTokensThisMonth.toLocaleString() || "0"}
          </div>
        </div>
        <div className="p-6 border border-white/15">
          <div className="text-white/60 text-xs uppercase tracking-wider mb-2 font-mono">Active Keys</div>
          <div className="text-3xl font-light">
            {statsLoading ? "..." : stats?.activeKeys || "0"}
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">API Keys</h2>
          <button 
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-3 py-1.5 border border-white/20 text-sm hover:bg-white/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Key
          </button>
        </div>

        {showCreate && (
          <div className="p-4 border border-white/15 mb-4 bg-white/5">
            <form onSubmit={handleCreate} className="flex gap-4">
              <input
                type="text"
                placeholder="Key Name (e.g. Production)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="flex-1 px-3 py-2 bg-black border border-white/20 focus:border-white outline-none text-sm"
                required
              />
              <button 
                type="submit" 
                disabled={createKey.isPending}
                className="px-4 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-50"
              >
                {createKey.isPending ? "Generating..." : "Generate"}
              </button>
            </form>
          </div>
        )}

        {createdSecret && (
          <div className="p-6 border border-white mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium mb-1">Save your new API key</h3>
                <p className="text-white/60 text-sm mb-4">Please copy this key and store it securely. You will not be able to see it again.</p>
                <div className="flex items-center gap-2">
                  <code className="px-3 py-2 bg-white/10 border border-white/20 text-sm font-mono break-all max-w-full">
                    {createdSecret}
                  </code>
                  <button 
                    onClick={() => copyToClipboard(createdSecret)}
                    className="p-2 border border-white/20 hover:bg-white/10 transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button 
                onClick={() => setCreatedSecret(null)}
                className="text-white/40 hover:text-white text-sm underline"
              >
                Done
              </button>
            </div>
          </div>
        )}

        <div className="border border-white/15 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-white/60 uppercase font-mono border-b border-white/15 bg-white/5">
              <tr>
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal">Prefix</th>
                <th className="px-4 py-3 font-normal">Created</th>
                <th className="px-4 py-3 font-normal">Last Used</th>
                <th className="px-4 py-3 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keysLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-white/40">Loading keys...</td>
                </tr>
              ) : apiKeys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-white/40">No API keys found.</td>
                </tr>
              ) : (
                apiKeys.map((key) => (
                  <tr key={key.id} className="border-b border-white/15 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium">{key.name}</td>
                    <td className="px-4 py-3 font-mono text-white/60">{key.prefix}•••</td>
                    <td className="px-4 py-3 text-white/60">{new Date(key.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-white/60">
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button 
                        onClick={() => handleRevoke(key.id)}
                        disabled={revokeKey.isPending}
                        className="text-white/40 hover:text-white transition-colors p-1"
                        title="Revoke Key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
