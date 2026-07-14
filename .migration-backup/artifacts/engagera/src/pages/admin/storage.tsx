import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import { AdminNav } from "@/components/admin/AdminNav";
import { useDatasetVersions, useDatasetDownloadUrl } from "@/lib/adminApi";
import { Download, Loader2, FileJson } from "lucide-react";
import { useAlert } from "@/hooks/useAlert";

export default function AdminStorage() {
  const { data, isLoading } = useDatasetVersions();
  const download = useDatasetDownloadUrl();
  const alert = useAlert();

  const versions = data?.versions ?? [];

  const handleDownload = (storagePath: string) => {
    download.mutate(storagePath, {
      onSuccess: (res) => {
        window.open(res.url, "_blank", "noopener,noreferrer");
      },
      onError: () => alert("Failed to generate download link.", "error"),
    });
  };

  return (
    <AppLayout title="Admin">
      <AdminNav />

      <h2 className="text-base font-semibold tracking-tight mb-2">Dataset Storage</h2>
      <p className="text-xs text-white/40 mb-5">
        Exported JSONL snapshots from the private <code className="font-mono">datasets</code> Supabase Storage bucket.
        Each version is immutable and never overwritten.
      </p>

      <div className="rounded-2xl bg-white/[0.03] overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-white/25">
          <span>Version</span>
          <span>File</span>
          <span>Examples</span>
          <span>Created</span>
          <span />
        </div>
        <div className="divide-y divide-white/[0.06]">
          {isLoading ? (
            <div className="px-5 py-8 text-center text-sm text-white/30">Loading…</div>
          ) : versions.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <FileJson className="w-8 h-8 text-white/15 mx-auto mb-3" />
              <p className="text-sm text-white/40">No dataset versions exported yet.</p>
              <p className="text-xs text-white/25 mt-1">Export approved candidates from the Dataset tab first.</p>
            </div>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 items-center px-5 py-3.5">
                <span className="text-sm font-mono font-medium">{v.version}</span>
                <span className="text-xs font-mono text-white/40 truncate">{v.storage_path}</span>
                <span className="text-sm text-white/60">{v.example_count.toLocaleString()}</span>
                <span className="text-xs text-white/40">{new Date(v.created_at).toLocaleString()}</span>
                <button
                  onClick={() => handleDownload(v.storage_path)}
                  disabled={download.isPending}
                  className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors disabled:opacity-50 justify-self-end"
                  title="Download"
                >
                  {download.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
