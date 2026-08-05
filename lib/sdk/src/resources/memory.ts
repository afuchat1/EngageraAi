// ---------------------------------------------------------------------------
// Engagera SDK — Memory resource
// ---------------------------------------------------------------------------

import type { HttpClient } from "../http.js";

export type MemoryType = "conversation" | "user" | "project" | "knowledge";

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCreateParams {
  content: string;
  type?: MemoryType;
  importance?: number;
  tags?: string[];
}

export interface MemorySearchParams {
  query: string;
  type?: MemoryType;
  limit?: number;
}

export interface MemoryListResponse {
  memories: Memory[];
  total: number;
}

export class Memory_ {
  constructor(private readonly http: HttpClient) {}

  /**
   * List all stored memories.
   *
   * @example
   * ```ts
   * const { memories } = await client.memory.list();
   * memories.forEach(m => console.log(m.content));
   * ```
   */
  async list(type?: MemoryType): Promise<MemoryListResponse> {
    const path = type ? `/memory?type=${type}` : "/memory";
    const raw = (await this.http.get(path)) as {
      memories?: unknown[];
      total?: number;
    };
    const memories = ((raw.memories ?? []) as Record<string, unknown>[]).map(normaliseMemory);
    return { memories, total: raw.total ?? memories.length };
  }

  /**
   * Search memories semantically.
   *
   * @example
   * ```ts
   * const results = await client.memory.search({ query: "user's programming preferences" });
   * ```
   */
  async search(params: MemorySearchParams): Promise<MemoryListResponse> {
    const raw = (await this.http.post("/memory/search", params, false)) as {
      memories?: unknown[];
      total?: number;
    };
    const memories = ((raw.memories ?? []) as Record<string, unknown>[]).map(normaliseMemory);
    return { memories, total: raw.total ?? memories.length };
  }

  /**
   * Add a new memory.
   *
   * @example
   * ```ts
   * await client.memory.add({
   *   content: "User prefers TypeScript over JavaScript",
   *   type: "user",
   *   importance: 8,
   * });
   * ```
   */
  async add(params: MemoryCreateParams): Promise<Memory> {
    const raw = (await this.http.post("/memory", params, false)) as Record<string, unknown>;
    return normaliseMemory(raw);
  }

  /**
   * Delete a memory by ID.
   */
  async delete(memoryId: string): Promise<void> {
    await this.http.delete(`/memory/${memoryId}`);
  }

  /**
   * Delete all memories (optionally filter by type).
   */
  async clear(type?: MemoryType): Promise<void> {
    const path = type ? `/memory?type=${type}` : "/memory";
    await this.http.delete(path);
  }
}

function normaliseMemory(raw: Record<string, unknown>): Memory {
  return {
    id: (raw.id as string) ?? "",
    content: (raw.content as string) ?? "",
    type: (raw.type as MemoryType) ?? "user",
    importance: (raw.importance as number) ?? 5,
    tags: raw.tags as string[] | undefined,
    createdAt: (raw.created_at ?? raw.createdAt ?? new Date().toISOString()) as string,
    updatedAt: (raw.updated_at ?? raw.updatedAt ?? new Date().toISOString()) as string,
  };
}
