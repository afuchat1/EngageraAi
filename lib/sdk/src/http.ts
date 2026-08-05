// ---------------------------------------------------------------------------
// Engagera SDK — HTTP layer
// ---------------------------------------------------------------------------

import { EngageraAuthError, EngageraError, EngageraRateLimitError } from "./error.js";
import type { EngageraClientOptions } from "./types.js";

export const DEFAULT_BASE_URL =
  "https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1";

export class HttpClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly timeout: number;
  readonly defaultModel: string;

  constructor(opts: EngageraClientOptions) {
    if (!opts.apiKey) throw new EngageraAuthError("apiKey is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = opts.timeout ?? 120_000;
    this.defaultModel = opts.defaultModel ?? "engagera-pro";
  }

  buildHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-engagera-api-key": this.apiKey,
      ...extra,
    };
  }

  async post(path: string, body: unknown, stream: false): Promise<unknown>;
  async post(path: string, body: unknown, stream: true): Promise<Response>;
  async post(
    path: string,
    body: unknown,
    stream: boolean,
  ): Promise<unknown | Response> {
    const response = await this.request("POST", path, body);
    if (stream) return response;
    return response.json();
  }

  async get(path: string): Promise<unknown> {
    const response = await this.request("GET", path);
    return response.json();
  }

  async patch(path: string, body: unknown): Promise<unknown> {
    const response = await this.request("PATCH", path, body);
    return response.json();
  }

  async delete(path: string): Promise<void> {
    await this.request("DELETE", path);
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.buildHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new EngageraAuthError();
      }
      if (response.status === 429) {
        throw new EngageraRateLimitError();
      }
      const text = await response.text().catch(() => "Unknown error");
      throw new EngageraError(text, { status: response.status });
    }

    return response;
  }
}
