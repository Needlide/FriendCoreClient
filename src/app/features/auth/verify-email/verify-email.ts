import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/models/api-error';
import { AuthError } from '../ui/auth-error';
import { AuthLayout } from '../ui/auth-layout';

type VerifyState = 'verifying' | 'done' | 'failed' | 'no-token';

/**
 * Consumes the `?token=` link from the verification email. Fires exactly once on init
 * (guarded by construction — no button, no retry loop hammering the endpoint):
 * success restores the session and routes home; an invalid/expired token lands in
 * `failed` with a calm explanation instead of a stack trace.
 */
@Component({
  selector: 'fc-verify-email',
  imports: [RouterLink, AuthLayout, AuthError],
  templateUrl: './verify-email.html',
})
export class VerifyEmail {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly state = signal<VerifyState>('verifying');
  protected readonly error = signal<ApiError | null>(null);

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set('no-token');
      return;
    }
    this.auth.verifyEmail(token).subscribe({
      next: () => {
        this.state.set('done');
        // Brief beat so the success message registers, then into the app.
        setTimeout(() => void this.router.navigate(['/']), 1200);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.state.set('failed');
      },
    });
  }
}
