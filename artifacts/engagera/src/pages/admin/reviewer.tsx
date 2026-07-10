import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import { AdminNav } from "@/components/admin/AdminNav";
import { useReviewerLogs, useRunReviewer } from "@/lib/adminApi";
import { Loader2, Play } from "lucide-react";
import { useAlert } from "@/hooks/useAlert";

const DECISION_COLOR: Record<string, string> = {
  approved: "text-emerald-400",
  rejected: "text-red-400",
  pending: "text-white/40",
};

export default function AdminReviewer() {
  const { data, isLoading } = useReviewerLogs();
  const run = useRunReviewer();
  const alert = useAlert();

  const logs = data?.logs ?? [];

  const handleRun = () => {
    run.mutate(50, {
      onSuccess: (res) => alert(`Processed ${res.processed} — ${res.approved} approved, ${res.rejected} rejected, ${res.pending} held.`, "success"),
      onError: () => alert("Reviewer run failed.", "error"),
    });
  };

  return (
    <AppLayout title="Admin">
      <AdminNav />

      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold tracking-tight">Reviewer Logs</h2>
        <button
          onClick={handleRun}
          disabled={run.isPending}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-white text-black rounded-xl hover:bg-white/90 disabled:opacity-50 transition-colors"
        >
          {run.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          Run reviewer batch
        </button>
      </div>

      <div className="rounded-2xl bg-white/[0.03] overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-white/25">
          <span>Candidate</span>
          <span>Scores</span>
          <span>Decision</span>
          <span>When</span>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {isLoading ? (
            <div className="px-5 py-8 text-center text-sm text-white/30">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-white/40">No reviewer activity yet.</div>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 items-center px-5 py-3">
                <span className="text-sm font-mono text-white/50">#{l.candidate_id}</span>
                <span className="text-xs font-mono text-white/40 truncate">
                  {Object.entries(l.scores).map(([k, v]) => `${k}:${v}`).join(" ") || "—"}
                </span>
                <span className={`text-sm font-medium capitalize ${DECISION_COLOR[l.decision] ?? ""}`}>{l.decision}</span>
                <span className="text-xs text-white/40">{new Date(l.created_at).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
