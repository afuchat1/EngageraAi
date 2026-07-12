import React from "react";
import { X } from "lucide-react";

interface MessageDetailModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  request: string;
  response: string;
  meta?: { label: string; value: string | number }[];
}

// Full, unabridged view of a dataset candidate's request/response pair.
// Dashboard list rows truncate for scanability; this modal is the only
// place operators should rely on for the complete text before approving,
// rejecting, or auditing a candidate.
export function MessageDetailModal({ open, onClose, title, request, response, meta }: MessageDetailModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-[#0c0c0c] rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
          <h3 className="text-sm font-semibold">{title ?? "Candidate detail"}</h3>
          <button onClick={onClose} className="p-1.5 text-white/40 hover:text-white hover:bg-white/[0.07] rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-thin px-5 py-4 space-y-5">
          {meta && meta.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-white/40">
              {meta.map((m) => (
                <span key={m.label}>{m.label}: {m.value}</span>
              ))}
            </div>
          )}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">Request</p>
            <p className="text-sm text-white/85 whitespace-pre-wrap break-words">{request}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">Response</p>
            <p className="text-sm text-white/85 whitespace-pre-wrap break-words">{response}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
