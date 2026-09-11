/**
 * A single normalized error. The API speaks three different error shapes (see
 * normalize-error.ts); this is the one uniform shape the rest of the app consumes.
 */
export interface ApiErrorItem {
  /** Programmatic code, e.g. "User.EmailNotVerified". Branch on this. */
  code: string;
  /** Human-readable fallback text. */
  description: string;
  /** ErrorOr category, e.g. "Validation" | "NotFound" | "Conflict" (when present). */
  type?: string;
  numericType?: number;
}

/**
 * The single error type thrown for every failed HTTP call once normalized by the
 * error interceptor. Components can `catchError` and inspect `.status` / `.code`
 * without caring whether the server replied with an array, an empty body, or the
 * PascalCase rate-limit object.
 */
export class ApiError extends Error {
  constructor(
    /** HTTP status (0 means the request never reached the server — network/CORS). */
    readonly status: number,
    /** Always at least one item. */
    readonly errors: ApiErrorItem[],
    /** Seconds to back off, parsed from the Retry-After header on 429. */
    readonly retryAfterSeconds?: number,
  ) {
    super(errors[0]?.description || `Request failed (${status}).`);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** First (primary) error code, for the common single-error case. */
  get code(): string | undefined {
    return this.errors[0]?.code;
  }

  /** True if any returned error carries the given code. */
  has(code: string): boolean {
    return this.errors.some((e) => e.code === code);
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}
