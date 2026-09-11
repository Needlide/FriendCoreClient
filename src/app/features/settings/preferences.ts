import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PreferencesService } from '../../core/preferences/preferences.service';
import { ApiError } from '../../core/models/api-error';
import { UserPreferences } from '../../core/models/settings.models';
import { AuthError } from '../auth/ui/auth-error';

/**
 * Preferences & accessibility (`/settings/preferences`). One toggle per server
 * field, each with its one-sentence explanation (copy deck §6). Save sends the
 * WHOLE set (PATCH replaces everything) through PreferencesService, which also
 * re-applies the document attributes — the page visibly re-themes on save.
 */
@Component({
  selector: 'fc-preferences',
  imports: [FormsModule, AuthError],
  templateUrl: './preferences.html',
  styleUrl: './preferences.scss',
})
export class Preferences {
  private readonly prefs = inject(PreferencesService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected hideFlashing = signal(true);
  protected reduceMotion = signal(false);
  protected disableAutoplay = signal(true);
  protected reduceNoise = signal(false);
  protected contentPref = signal<UserPreferences['contentPreference']>('General');

  constructor() {
    this.prefs.load().subscribe({
      next: (p) => {
        this.hideFlashing.set(p.hideFlashingMedia);
        this.reduceMotion.set(p.reduceMotion);
        this.disableAutoplay.set(p.disableAutoplay);
        this.reduceNoise.set(p.reduceVisualNoise);
        this.contentPref.set(p.contentPreference);
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
    this.prefs
      .update({
        hideFlashingMedia: this.hideFlashing(),
        reduceMotion: this.reduceMotion(),
        disableAutoplay: this.disableAutoplay(),
        reduceVisualNoise: this.reduceNoise(),
        contentPreference: this.contentPref(),
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
