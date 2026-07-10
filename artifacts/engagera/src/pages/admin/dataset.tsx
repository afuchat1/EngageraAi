import React, { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { AdminNav } from "@/components/admin/AdminNav";
import {
  useDatasetCandidates, useDatasetStats, useDatasetVersions,
  useOverrideCandidate, useExportDataset, DatasetCandidate,
} from "@/lib/adminApi";
import { Check, X, Download, Loader2, Maximize2 } from "lucide-react";
import { useAlert } from "@/hooks/useAlert";
import { MessageDetailModal } from "@/components/admin/MessageDetailModal";

const TABS: { key: "pending" | "approved" | "rejected"; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default function AdminDataset() {
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [detail, setDetail] = useState<DatasetCandidate | null>(null);
  const { data, isLoading } = useDatasetCandidates(tab);
  const { data: stats } = useDatasetStats();
  const { data: versions } = useDatasetVersions();
  const override = useOverrideCandidate();
  const exportDataset = useExportDataset();
  const alert = useAlert();

  const candidates = data?.candidates ?? [];

  const handleExport = () => {
    exportDataset.mutate(undefined, {
      onSuccess: (res) => alert(`Exported ${res.version} — ${res.exampleCount} examples.`, "success"),
      onError: (err: any) => alert(err?.message ?? "Nothing new to export.", "error"),
    });
  };

  return (
    <AppLayout title="Admin">
      <AdminNav />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-2xl bg-white/[0.04] p-5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-2">Total Candidates</p>
          <p className="text-3xl font-light">{stats?.total ?? "—"}</p>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-2">By Model</p>
          <p className="text-xs text-white/50 leading-relaxed">
            {stats ? Object.entries(stats.byModel).map(([m, c]) => `${m}: ${c}`).join(" · ") : "—"}
          </p>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-2">Dataset Versions</p>
            <p className="text-3xl font-light">{versions?.versions.length ?? "—"}</p>
          </div>
          <button
            onClick={handleExport}
            disabled={exportDataset.isPending}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-white text-black rounded-xl hover:bg-white/90 disabled:opacity-50 transition-colors"
          >
            {exportDataset.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? "bg-white text-black" : "text-white/50 hover:text-white hover:bg-white/[0.07]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white/[0.03] overflow-hidden">
        {isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-white/30">Loading…</div>
        ) : candidates.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-white/40">No {tab} candidates.</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {candidates.map((c) => (
              <div key={c.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <button
                    onClick={() => setDetail(c)}
                    className="min-w-0 flex-1 text-left group"
                    title="View full request and response"
                  >
                    <p className="text-xs text-white/40 font-mono mb-1">{c.model} · {c.language ?? "en"} · {new Date(c.created_at).toLocaleString()}</p>
                    <p className="text-sm font-medium truncate group-hover:text-white/80">{c.request}</p>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setDetail(c)}
                      className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
                      title="View full message"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    {tab === "pending" && (
                      <>
                        <button
                          onClick={() => override.mutate({ id: c.id, status: "approved" })}
                          className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-emerald-400/20 hover:text-emerald-400 transition-colors"
                          title="Approve"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => override.mutate({ id: c.id, status: "rejected" })}
                          className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-red-400/20 hover:text-red-400 transition-colors"
                          title="Reject"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => setDetail(c)} className="text-left w-full">
                  <p className="text-xs text-white/50 line-clamp-2 hover:text-white/70 transition-colors">{c.response}</p>
                </button>
                {(c.quality_score !== null) && (
                  <p className="text-[10px] font-mono text-white/30 mt-2">
                    quality {c.quality_score} · safety {c.safety_score} · dup {c.duplicate_score} · hallucination {c.hallucination_score}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {detail && (
        <MessageDetailModal
          open={!!detail}
          onClose={() => setDetail(null)}
          title={`Candidate #${detail.id}`}
          request={detail.request}
          response={detail.response}
          meta={[
            { label: "model", value: detail.model },
            { label: "language", value: detail.language ?? "en" },
            { label: "status", value: detail.reviewer_status },
            ...(detail.quality_score !== null ? [
              { label: "quality", value: detail.quality_score! },
              { label: "safety", value: detail.safety_score! },
              { label: "duplicate", value: detail.duplicate_score! },
              { label: "hallucination", value: detail.hallucination_score! },
            ] : []),
          ]}
        />
      )}
    </AppLayout>
  );
}
