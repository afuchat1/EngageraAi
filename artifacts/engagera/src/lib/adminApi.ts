import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";

// Thin hand-written client for the Admin API — kept separate from the
// generated api-client-react surface since these endpoints are read-only
// admin tooling, not part of the public/dashboard API contract.

export interface AdminOverview {
  datasetCandidates: { pending: number; approved: number; rejected: number };
  apiRequests30d: number;
  knowledgeBaseArticles: number;
  models: { model_key: string; deployment_status: string; training_status: string }[];
  trainingJobsRunning: number;
}

export interface DatasetCandidate {
  id: number;
  request: string;
  response: string;
  model: string;
  language: string | null;
  category: string | null;
  reviewer_status: "pending" | "approved" | "rejected";
  quality_score: number | null;
  safety_score: number | null;
  duplicate_score: number | null;
  hallucination_score: number | null;
  dataset_version: string | null;
  reviewer_notes: string | null;
  created_at: string;
}

export interface ReviewerLog {
  id: number;
  candidate_id: number;
  reviewer: string;
  decision: string;
  scores: Record<string, number>;
  notes: string | null;
  created_at: string;
}

export interface ApiAnalytics {
  totalRequests: number;
  avgLatencyMs: number;
  byModel: Record<string, { requests: number; tokens: number; errors: number }>;
}

export interface ModelRegistryEntry {
  model_key: string;
  display_name: string;
  deployment_status: string;
  training_status: string;
  created_at: string;
}

export interface TrainingJob {
  id: number;
  model_key: string;
  status: string;
  created_at: string;
}

export interface DatasetVersion {
  id: number;
  version: string;
  storage_path: string;
  example_count: number;
  created_at: string;
}

export interface SystemHealth {
  requests24h: number;
  errors24h: number;
  errorRate: number;
  status: "idle" | "healthy" | "degraded";
}

// Hand-written since the generated client only exposes revoke (soft
// deactivate); permanent delete needs the ?permanent=true query param.
export function useDeleteApiKeyPermanently() {
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean; message: string }>(`/api/api-keys/${id}?permanent=true`, {
        method: "DELETE",
      }),
  });
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => customFetch<AdminOverview>("/api/admin/overview"),
    retry: false,
  });
}

export function useAdminSystemHealth() {
  return useQuery({
    queryKey: ["admin", "system-health"],
    queryFn: () => customFetch<SystemHealth>("/api/admin/system-health"),
    retry: false,
    refetchInterval: 10_000,
  });
}

export function useDatasetCandidates(status: "pending" | "approved" | "rejected") {
  return useQuery({
    queryKey: ["admin", "dataset-candidates", status],
    queryFn: () =>
      customFetch<{ candidates: DatasetCandidate[] }>(`/api/admin/dataset-candidates?status=${status}`),
    retry: false,
  });
}

export function useDatasetCandidate(id: number | null) {
  return useQuery({
    queryKey: ["admin", "dataset-candidate", id],
    queryFn: () => customFetch<{ candidate: DatasetCandidate }>(`/api/admin/dataset-candidate?id=${id}`),
    enabled: id !== null,
    retry: false,
  });
}

export function useDatasetStats() {
  return useQuery({
    queryKey: ["admin", "dataset-stats"],
    queryFn: () =>
      customFetch<{ total: number; byModel: Record<string, number>; byLanguage: Record<string, number> }>(
        "/api/admin/dataset-stats",
      ),
    retry: false,
  });
}

export function useDatasetVersions() {
  return useQuery({
    queryKey: ["admin", "dataset-versions"],
    queryFn: () => customFetch<{ versions: DatasetVersion[] }>("/api/admin/dataset-versions"),
    retry: false,
  });
}

export function useReviewerLogs() {
  return useQuery({
    queryKey: ["admin", "reviewer-logs"],
    queryFn: () => customFetch<{ logs: ReviewerLog[] }>("/api/admin/reviewer-logs"),
    retry: false,
  });
}

export function useApiAnalytics() {
  return useQuery({
    queryKey: ["admin", "api-analytics"],
    queryFn: () => customFetch<ApiAnalytics>("/api/admin/api-analytics"),
    retry: false,
  });
}

export function useModelRegistry() {
  return useQuery({
    queryKey: ["admin", "models"],
    queryFn: () => customFetch<{ models: ModelRegistryEntry[] }>("/api/admin/models"),
    retry: false,
  });
}

export function useTrainingJobs() {
  return useQuery({
    queryKey: ["admin", "training-jobs"],
    queryFn: () => customFetch<{ jobs: TrainingJob[] }>("/api/admin/training-jobs"),
    retry: false,
  });
}

// ── Platform: API keys & users (full admin control) ─────────────────────────

export interface PlatformApiKey {
  id: number;
  name: string;
  prefix: string;
  ownerId: string;
  ownerEmail: string;
  isActive: boolean;
  isPaused: boolean;
  pausedUntil: string | null;
  totalRequests: number;
  requests30d: number;
  tokensLifetime: number;
  tokens30d: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface PlatformUser {
  userId: string;
  email: string;
  totalKeys: number;
  activeKeys: number;
  pausedKeys: number;
  oldestKeyAt: string;
  tokensLifetime: number;
  tokens30d: number;
  requestsLifetime: number;
  requests30d: number;
}

export function usePlatformApiKeys() {
  return useQuery({
    queryKey: ["admin", "platform-api-keys"],
    queryFn: () => customFetch<{ keys: PlatformApiKey[] }>("/api/admin/platform-api-keys"),
    retry: false,
    refetchInterval: 10_000,
  });
}

export interface PlatformUsageDay {
  date: string;
  tokens: number;
  requests: number;
}

export function usePlatformUsageDaily(days = 30) {
  return useQuery({
    queryKey: ["admin", "platform-usage-daily", days],
    queryFn: () =>
      customFetch<{ series: PlatformUsageDay[]; totalTokens: number; totalRequests: number }>(
        `/api/admin/platform-usage-daily?days=${days}`,
      ),
    retry: false,
  });
}

export function usePlatformUsers() {
  return useQuery({
    queryKey: ["admin", "platform-users"],
    queryFn: () => customFetch<{ users: PlatformUser[] }>("/api/admin/platform-users"),
    retry: false,
  });
}

// ── Real-time sync ────────────────────────────────────────────────────────────
// Subscribes to Supabase Realtime on engagera_usage_records and
// engagera_api_keys so admin tables update the moment a developer makes a
// request — no manual refresh required.
export function useAdminRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("admin-usage-realtime")
      // New usage record → refresh all usage-related queries immediately
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "engagera_usage_records" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin", "platform-api-keys"] });
          qc.invalidateQueries({ queryKey: ["admin", "platform-users"] });
          qc.invalidateQueries({ queryKey: ["admin", "platform-usage-daily"] });
          qc.invalidateQueries({ queryKey: ["admin", "system-health"] });
          qc.invalidateQueries({ queryKey: ["admin", "overview"] });
        },
      )
      // Key updated (pause / revoke / total_requests bump) → refresh key list
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "engagera_api_keys" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin", "platform-api-keys"] });
          qc.invalidateQueries({ queryKey: ["admin", "platform-users"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

export function usePauseApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, minutes }: { id: number; minutes: number }) =>
      customFetch<{ success: boolean; pausedUntil: string }>(`/api/admin/platform-api-keys/${id}/pause`, {
        method: "POST",
        body: JSON.stringify({ minutes }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "platform-api-keys"] }),
  });
}

export function useUnpauseApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/admin/platform-api-keys/${id}/unpause`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "platform-api-keys"] }),
  });
}

export function useSetApiKeyActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      customFetch<{ success: boolean; isActive: boolean }>(
        `/api/admin/platform-api-keys/${id}/${active ? "reactivate" : "revoke"}`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "platform-api-keys"] }),
  });
}

export function useRunReviewer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limit?: number) =>
      customFetch<{ processed: number; approved: number; pending: number; rejected: number }>(
        "/api/reviewer/run",
        { method: "POST", body: JSON.stringify({ limit }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

export function useOverrideCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: "approved" | "rejected" | "pending"; notes?: string }) =>
      customFetch(`/api/reviewer/${id}`, { method: "PATCH", body: JSON.stringify({ status, notes }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "dataset-candidates"] });
      qc.invalidateQueries({ queryKey: ["admin", "reviewer-logs"] });
    },
  });
}

export function useDatasetDownloadUrl() {
  return useMutation({
    mutationFn: (path: string) =>
      customFetch<{ url: string }>(`/api/admin/dataset-download?path=${encodeURIComponent(path)}`),
  });
}

export function useExportDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      customFetch<{ version: string; exampleCount: number; storagePath: string }>("/api/dataset-export", {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "dataset-versions"] });
      qc.invalidateQueries({ queryKey: ["admin", "dataset-candidates"] });
    },
  });
}
