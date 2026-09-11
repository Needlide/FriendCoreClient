import { Component, input } from '@angular/core';
import { ApiError } from '../../../core/models/api-error';

/**
 * One calm error banner for auth forms. Implements the copy rules from
 * `docs/design/content-and-a11y.md §3` in a single place:
 *  - login + 401 → "Invalid email or password." (never hint which field failed)
 *  - 403 → "This account isn't available." (never banned/suspended)
 *  - 429 → "Too many requests…" with the Retry-After seconds when the server sent them
 *  - anything else → the API's `description` (prefer server text over invented copy)
 *
 * `role="alert"` announces it to screen readers (WCAG 4.1.3).
 */
@Component({
  selector: 'fc-auth-error',
  template: `
    @if (error(); as err) {
      <p class="auth-error" role="alert">{{ message(err) }}</p>
    }
  `,
  styleUrl: './auth-error.scss',
})
export class AuthError {
  /** Normalized server error, or null when there is nothing to show. */
  error = input<ApiError | null>(null);
  /** 'login' applies the special 401 wording; every other form uses server text. */
  context = input<'login' | 'generic'>('generic');

  protected message(err: ApiError): string {
    if (err.status === 401 && this.context() === 'login') return 'Invalid email or password.';
    if (err.status === 403) return "This account isn't available.";
    if (err.isRateLimited) {
      const wait = err.retryAfterSeconds;
      return wait !== undefined
        ? `Too many requests. Try again in ${wait} seconds.`
        : 'Too many requests. Try again shortly.';
    }
    return err.errors[0]?.description || 'Something went wrong. Try again.';
  }
}
