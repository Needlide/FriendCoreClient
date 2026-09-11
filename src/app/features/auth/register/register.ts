import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/models/api-error';
import { AuthError } from '../ui/auth-error';
import { AuthLayout } from '../ui/auth-layout';

/**
 * Registration form. Mirrors the server's `RegisterUserCommandValidator` just enough
 * for fast inline feedback — the server is still the gate (never trust client-side):
 * username 3–30 chars, display name required, valid email, password ≥ 8 chars.
 *
 * On 201 the API already starts a session (no separate login call), so we navigate
 * straight to onboarding — a fresh account has no tags yet, and discovery (step 2
 * of onboarding) matches on tags. Returning users never land here (guestGuard).
 * On 409 the server tells us *which* field collided via `description`; the banner
 * shows it and every typed value stays put.
 */
@Component({
  selector: 'fc-register',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout, AuthError],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30)]],
    displayName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
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
    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigate(['/onboarding']),
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.busy.set(false);
      },
    });
  }
}
