import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/models/api-error';
import { AuthError } from '../ui/auth-error';
import { AuthLayout } from '../ui/auth-layout';

/**
 * Consumes the `?token=` link from the reset email. Same shape as verify-email:
 * fire from the form (not on init — the user types a new password first), single
 * use server-side (replay → 400), then back to sign in.
 */
@Component({
  selector: 'fc-reset-password',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout, AuthError],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly token = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly done = signal(false);

  constructor() {
    this.token.set(this.route.snapshot.queryParamMap.get('token'));
  }

  protected submit(): void {
    const token = this.token();
    if (this.form.invalid || this.busy() || !token) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.auth.resetPassword({ token, newPassword: this.form.controls.password.value }).subscribe({
      next: () => {
        this.busy.set(false);
        this.done.set(true);
        setTimeout(() => void this.router.navigate(['/auth/login']), 1500);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.busy.set(false);
      },
    });
  }
}
