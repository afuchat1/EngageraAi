import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import { AdminNav } from "@/components/admin/AdminNav";
import { useApiAnalytics } from "@/lib/adminApi";

export default function AdminAnalytics() {
  const { data, isLoading } = useApiAnalytics();
  const byModel = data ? Object.entries(data.byModel) : [];

  return (
    <AppLayout title="Admin">
      <AdminNav />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl bg-white/[0.04] p-5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-2">Total API Requests (30d)</p>
          <p className="text-3xl font-light">{isLoading ? "—" : data?.totalRequests ?? 0}</p>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-2">Avg Latency</p>
          <p className="text-3xl font-light">{isLoading ? "—" : `${data?.avgLatencyMs ?? 0}ms`}</p>
        </div>
      </div>

      <h2 className="text-base font-semibold tracking-tight mb-5">By Model</h2>
      <div className="rounded-2xl bg-white/[0.03] overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-white/25">
          <span>Model</span>
          <span>Requests</span>
          <span>Tokens</span>
          <span>Errors</span>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {isLoading ? (
            <div className="px-5 py-8 text-center text-sm text-white/30">Loading…</div>
          ) : byModel.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-white/40">No API traffic in the last 30 days.</div>
          ) : (
            byModel.map(([model, stats]) => (
              <div key={model} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-5 py-3.5">
                <span className="text-sm font-mono">{model}</span>
                <span className="text-sm text-white/60">{stats.requests}</span>
                <span className="text-sm text-white/60">{stats.tokens.toLocaleString()}</span>
                <span className={`text-sm ${stats.errors > 0 ? "text-red-400" : "text-white/40"}`}>{stats.errors}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
