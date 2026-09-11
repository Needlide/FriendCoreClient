import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, ApiErrorItem } from '../models/api-error';

/**
 * Collapses every server error shape into a single {@link ApiError}:
 *  - 400 / 404 / 409 (and most 500s): a JSON array of `{ code, description, type, numericType }`.
 *  - 401 / 403: empty body by design (anti-enumeration) — we synthesize a code.
 *  - 429: a single PascalCase object `{ Code, Description }` + a Retry-After header (seconds).
 *  - status 0: the request never reached the server (network down / CORS / TLS).
 */
export function normalizeHttpError(err: HttpErrorResponse): ApiError {
  const status = err.status;

  if (status === 0) {
    return new ApiError(0, [
      {
        code: 'Network.Unreachable',
        description: 'Could not reach the server. Check your connection and try again.',
      },
    ]);
  }

  if (status === 401) {
    return new ApiError(401, [
      { code: 'Auth.Unauthorized', description: 'You need to sign in to do that.' },
    ]);
  }

  if (status === 403) {
    return new ApiError(403, [
      { code: 'Auth.Forbidden', description: 'This account isn’t available.' },
    ]);
  }

  if (status === 429) {
    const header = err.headers?.get('Retry-After');
    const retryAfter = header && !Number.isNaN(Number(header)) ? Number(header) : undefined;
    return new ApiError(429, [readRateLimitBody(err.error)], retryAfter);
  }

  const items = readErrorArray(err.error);
  if (items.length > 0) return new ApiError(status, items);

  return new ApiError(status, [
    {
      code: 'Unknown',
      description:
        typeof err.error === 'string' && err.error
          ? err.error
          : err.message || `Request failed (${status}).`,
    },
  ]);
}

/** Reads a value by any of the given keys (handles camelCase vs PascalCase). */
function pick(obj: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function readErrorArray(body: unknown): ApiErrorItem[] {
  if (!Array.isArray(body)) return [];
  return body.map((raw) => {
    const e = raw as Record<string, unknown>;
    return {
      code: (pick(e, 'code', 'Code') as string) ?? 'Unknown',
      description: (pick(e, 'description', 'Description') as string) ?? '',
      type: pick(e, 'type', 'Type') as string | undefined,
      numericType: pick(e, 'numericType', 'NumericType') as number | undefined,
    };
  });
}

function readRateLimitBody(body: unknown): ApiErrorItem {
  if (body && typeof body === 'object') {
    const e = body as Record<string, unknown>;
    return {
      code: (pick(e, 'Code', 'code') as string) ?? 'Common.RateLimited',
      description:
        (pick(e, 'Description', 'description') as string) ??
        'Too many requests. Please slow down and try again shortly.',
    };
  }
  return {
    code: 'Common.RateLimited',
    description: 'Too many requests. Please slow down and try again shortly.',
  };
}
