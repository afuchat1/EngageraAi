import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import { AdminNav } from "@/components/admin/AdminNav";
import { useModelRegistry, useTrainingJobs } from "@/lib/adminApi";

const STATUS_COLOR: Record<string, string> = {
  external_fallback: "text-white/40",
  training: "text-amber-400",
  deployed: "text-emerald-400",
  running: "text-amber-400",
  completed: "text-emerald-400",
  failed: "text-red-400",
};

export default function AdminModels() {
  const { data: modelsData, isLoading: modelsLoading } = useModelRegistry();
  const { data: jobsData, isLoading: jobsLoading } = useTrainingJobs();

  const models = modelsData?.models ?? [];
  const jobs = jobsData?.jobs ?? [];

  return (
    <AppLayout title="Admin">
      <AdminNav />

      <div className="mb-8">
        <h2 className="text-base font-semibold tracking-tight mb-5">Model Registry</h2>
        <div className="rounded-2xl bg-white/[0.03] overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-white/25">
            <span>Model</span>
            <span>Deployment</span>
            <span>Training</span>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {modelsLoading ? (
              <div className="px-5 py-8 text-center text-sm text-white/30">Loading…</div>
            ) : (
              models.map((m) => (
                <div key={m.model_key} className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{m.display_name}</p>
                    <p className="text-xs text-white/30 font-mono">{m.model_key}</p>
                  </div>
                  <span className={`text-xs font-medium capitalize ${STATUS_COLOR[m.deployment_status] ?? ""}`}>
                    {m.deployment_status.replace(/_/g, " ")}
                  </span>
                  <span className={`text-xs font-medium capitalize ${STATUS_COLOR[m.training_status] ?? ""}`}>
                    {m.training_status.replace(/_/g, " ")}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight mb-5">Training Jobs</h2>
        <div className="rounded-2xl bg-white/[0.03] overflow-hidden">
          {jobsLoading ? (
            <div className="px-5 py-8 text-center text-sm text-white/30">Loading…</div>
          ) : jobs.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-white/40">No training jobs yet.</p>
              <p className="text-xs text-white/25 mt-1">
                Infrastructure is scaffolded — actual model training is not yet enabled.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm font-mono">{j.model_key}</span>
                  <span className={`text-xs font-medium capitalize ${STATUS_COLOR[j.status] ?? ""}`}>{j.status}</span>
                  <span className="text-xs text-white/40">{new Date(j.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
