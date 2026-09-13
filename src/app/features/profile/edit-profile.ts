import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models/api-error';
import { AuthError } from '../auth/ui/auth-error';
import { ProfileService } from './profile.service';

/**
 * Edit your profile (`/settings/profile`). Prefills from the server (your current
 * values, not blanks) and stays put on save — a "View profile" link replaces the
 * old auto-redirect, so saving never yanks you out of settings mid-flow.
 * Interests live on their own page (`/settings/interests`).
 */
@Component({
  selector: 'fc-edit-profile',
  imports: [ReactiveFormsModule, RouterLink, AuthError],
  templateUrl: './edit-profile.html',
  styleUrl: './edit-profile.scss',
})
export class EditProfile {
  private readonly profiles = inject(ProfileService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    displayName: ['', Validators.maxLength(100)],
    bio: [''],
    websiteUrl: [''],
    location: [''],
  });

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  constructor() {
    const me = this.auth.session()?.username;
    if (!me) return; // authGuard guarantees a session; defensive only.
    this.profiles.getProfile(me).subscribe({
      next: (profile) => {
        this.form.setValue({
          displayName: profile.displayName,
          bio: profile.bio ?? '',
          websiteUrl: profile.websiteUrl ?? '',
          location: profile.location ?? '',
        });
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }

  protected username(): string | undefined {
    return this.auth.session()?.username;
  }

  protected save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
    const raw = this.form.getRawValue();
    this.profiles
      .updateProfile({
        displayName: raw.displayName.trim() || null,
        bio: raw.bio.trim() || null,
        websiteUrl: raw.websiteUrl.trim() || null,
        location: raw.location.trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
        },
        error: (err: unknown) => {
          this.error.set(err instanceof ApiError ? err : null);
          this.saving.set(false);
        },
      });
  }
}
