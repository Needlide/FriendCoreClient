import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/models/api-error';
import { AuthError } from '../ui/auth-error';
import { AuthLayout } from '../ui/auth-layout';

/**
 * Sign-in form. Thin by design: it collects credentials, delegates everything
 * transport-related to `AuthService.login` (bearer + session live there), and only
 * owns UI state — `busy` (double-submit guard) and `error` (mapped by `fc-auth-error`
 * per the copy rules: 401 here is always "Invalid username or password.").
 *
 * Identity note: login is username + password. Email is not the handle anywhere —
 * it exists only transiently inside verification and reset requests.
 *
 * Note on 401 handling: the request carries `skipAuth()`, so the auth interceptor
 * does NOT attempt a refresh-and-retry on failure — a login 401 is genuine wrong
 * credentials, not an expired token. Retrying it as a refresh would be wrong.
 */
@Component({
  selector: 'fc-login',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout, AuthError],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected submit(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigate(['/']),
      error: (err: unknown) => {
        // Values are preserved on failure (COGA: never wipe a form the user filled).
        this.error.set(err instanceof ApiError ? err : null);
        this.busy.set(false);
      },
    });
  }
}
