import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import { AdminNav } from "@/components/admin/AdminNav";
import { useAdminOverview, useAdminSystemHealth } from "@/lib/adminApi";
import { Activity, BookOpen, Boxes, GitBranch, ShieldAlert } from "lucide-react";

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

const HEALTH_COLOR: Record<string, string> = {
  healthy: "text-emerald-400",
  degraded: "text-amber-400",
  idle: "text-white/40",
};

export default function AdminOverview() {
  const { data, isLoading } = useAdminOverview();
  const { data: health } = useAdminSystemHealth();

  const dc = data?.datasetCandidates;

  return (
    <AppLayout title="Admin">
      <AdminNav />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="API Requests (30d)" icon={Activity} value={isLoading ? "—" : (data?.apiRequests30d.toLocaleString() ?? "0")} />
        <StatCard label="Knowledge Base Articles" icon={BookOpen} value={isLoading ? "—" : (data?.knowledgeBaseArticles ?? "0")} />
        <StatCard label="Models Registered" icon={Boxes} value={isLoading ? "—" : (data?.models.length ?? "0")} />
        <StatCard label="Training Jobs Running" icon={GitBranch} value={isLoading ? "—" : (data?.trainingJobsRunning ?? "0")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold mb-4">Dataset Candidates</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">Pending</p>
              <p className="text-2xl font-light">{isLoading ? "—" : dc?.pending ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">Approved</p>
              <p className="text-2xl font-light">{isLoading ? "—" : dc?.approved ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">Rejected</p>
              <p className="text-2xl font-light">{isLoading ? "—" : dc?.rejected ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">System Health (24h)</h2>
            <ShieldAlert className={`w-4 h-4 ${health ? HEALTH_COLOR[health.status] : "text-white/20"}`} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">Requests</p>
              <p className="text-2xl font-light">{health?.requests24h ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">Errors</p>
              <p className="text-2xl font-light">{health?.errors24h ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">Status</p>
              <p className={`text-2xl font-light capitalize ${health ? HEALTH_COLOR[health.status] : ""}`}>
                {health?.status ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
