// ---------------------------------------------------------------------------
// Engagera SDK — Workflows resource
// ---------------------------------------------------------------------------

import type { HttpClient } from "../http.js";
import type { Message } from "../types.js";

export type WorkflowStatus = "idle" | "running" | "completed" | "failed" | "paused";
export type WorkflowTrigger = "instant" | "scheduled" | "event" | "manual";

export interface WorkflowStep {
  id: string;
  name: string;
  agentId: string;
  prompt?: string;
  dependsOn?: string[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  status: WorkflowStatus;
  ownerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowCreateParams {
  name: string;
  description?: string;
  trigger?: WorkflowTrigger;
  steps: Omit<WorkflowStep, "id">[];
}

export interface WorkflowRunParams {
  workflowId: string;
  input?: string;
  messages?: Message[];
  variables?: Record<string, string>;
}

export interface WorkflowRunResult {
  runId: string;
  workflowId: string;
  status: WorkflowStatus;
  output?: string;
  stepResults?: Record<string, string>;
  startedAt: string;
  completedAt?: string;
}

export class Workflows {
  constructor(private readonly http: HttpClient) {}

  /**
   * List all workflows.
   */
  async list(): Promise<{ workflows: Workflow[]; total: number }> {
    const raw = (await this.http.get("/workflows")) as {
      workflows?: unknown[];
      total?: number;
    };
    const workflows = ((raw.workflows ?? []) as Record<string, unknown>[]).map(normaliseWorkflow);
    return { workflows, total: raw.total ?? workflows.length };
  }

  /**
   * Create a new workflow.
   *
   * @example
   * ```ts
   * const wf = await client.workflows.create({
   *   name: "Content Pipeline",
   *   steps: [
   *     { name: "Research", agentId: "research", prompt: "Find top 5 topics in AI this week" },
   *     { name: "Write", agentId: "writing", prompt: "Write an article based on research", dependsOn: ["Research"] },
   *   ],
   * });
   * ```
   */
  async create(params: WorkflowCreateParams): Promise<Workflow> {
    const raw = (await this.http.post("/workflows", params, false)) as Record<string, unknown>;
    return normaliseWorkflow(raw);
  }

  /**
   * Run a workflow and receive the result.
   *
   * @example
   * ```ts
   * const result = await client.workflows.run({
   *   workflowId: "wf_abc123",
   *   input: "Build a marketing campaign for a new fitness app",
   * });
   * console.log(result.status, result.output);
   * ```
   */
  async run(params: WorkflowRunParams): Promise<WorkflowRunResult> {
    const raw = (await this.http.post(`/workflows/${params.workflowId}/run`, {
      input: params.input,
      messages: params.messages,
      variables: params.variables,
    }, false)) as Record<string, unknown>;
    return {
      runId: (raw.run_id ?? raw.runId ?? "") as string,
      workflowId: params.workflowId,
      status: (raw.status as WorkflowStatus) ?? "completed",
      output: raw.output as string | undefined,
      stepResults: raw.step_results as Record<string, string> | undefined,
      startedAt: (raw.started_at ?? raw.startedAt ?? new Date().toISOString()) as string,
      completedAt: (raw.completed_at ?? raw.completedAt) as string | undefined,
    };
  }

  /**
   * Delete a workflow.
   */
  async delete(workflowId: string): Promise<void> {
    await this.http.delete(`/workflows/${workflowId}`);
  }
}

function normaliseWorkflow(raw: Record<string, unknown>): Workflow {
  return {
    id: (raw.id as string) ?? "",
    name: (raw.name as string) ?? "",
    description: (raw.description as string) ?? "",
    trigger: (raw.trigger as WorkflowTrigger) ?? "manual",
    steps: (raw.steps as WorkflowStep[]) ?? [],
    status: (raw.status as WorkflowStatus) ?? "idle",
    ownerId: (raw.owner_id ?? raw.ownerId) as string | undefined,
    createdAt: (raw.created_at ?? raw.createdAt ?? new Date().toISOString()) as string,
    updatedAt: (raw.updated_at ?? raw.updatedAt ?? new Date().toISOString()) as string,
  };
}
