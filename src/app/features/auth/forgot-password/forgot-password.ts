import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/models/api-error';
import { AuthError } from '../ui/auth-error';
import { AuthLayout } from '../ui/auth-layout';

/**
 * Forgot-password form. Blind by design: whether the username exists and the email
 * hash matches or not, success looks identical ("if it matches, an email is on its
 * way"). The form never learns which case happened — and neither does an attacker
 * probing it. Only a validation (400) or rate-limit (429) error surfaces.
 */
@Component({
  selector: 'fc-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout, AuthError],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly sent = signal(false);

  protected submit(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.auth.forgotPassword(this.form.getRawValue()).subscribe({
      next: () => {
        this.busy.set(false);
        this.sent.set(true);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.busy.set(false);
      },
    });
  }
}
