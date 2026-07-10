import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

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
    refetchInterval: 30_000,
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
