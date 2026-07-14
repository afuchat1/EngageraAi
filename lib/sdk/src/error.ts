// ---------------------------------------------------------------------------
// Engagera SDK — Error Classes
// ---------------------------------------------------------------------------

export class EngageraError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "EngageraError";
    this.status = options?.status;
    this.code = options?.code;
  }
}

export class EngageraAuthError extends EngageraError {
  constructor(message = "Invalid or missing API key") {
    super(message, { status: 401, code: "auth_error" });
    this.name = "EngageraAuthError";
  }
}

export class EngageraRateLimitError extends EngageraError {
  constructor(message = "Rate limit exceeded") {
    super(message, { status: 429, code: "rate_limit" });
    this.name = "EngageraRateLimitError";
  }
}

export class EngageraStreamError extends EngageraError {
  constructor(message: string) {
    super(message, { code: "stream_error" });
    this.name = "EngageraStreamError";
  }
}
