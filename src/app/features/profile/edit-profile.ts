import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models/api-error';
import { AuthError } from '../auth/ui/auth-error';
import { ProfileService } from './profile.service';

/**
 * Edit your profile (`/settings/profile`, UI-Plan §1). Prefills from the server
 * (your current values, not blanks), PATCHes only what changed… actually it sends
 * all four fields — the API treats them as optional patches, and sending the
 * current values back is a harmless no-op for unchanged fields.
 */
@Component({
  selector: 'fc-edit-profile',
  imports: [ReactiveFormsModule, AuthError],
  templateUrl: './edit-profile.html',
  styleUrl: './edit-profile.scss',
})
export class EditProfile {
  private readonly profiles = inject(ProfileService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
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
    if (!me) {
      void this.router.navigate(['/auth/login']);
      return;
    }
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
        next: (profile) => {
          this.saving.set(false);
          this.saved.set(true);
          // Brief confirmation, then back to the profile showing fresh values.
          setTimeout(() => void this.router.navigate(['/u', profile.username]), 800);
        },
        error: (err: unknown) => {
          this.error.set(err instanceof ApiError ? err : null);
          this.saving.set(false);
        },
      });
  }
}
