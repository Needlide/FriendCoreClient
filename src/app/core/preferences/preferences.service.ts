import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { UserPreferences } from '../models/settings.models';
import { SettingsService } from '../../features/settings/settings.service';

/**
 * Owns the user's accessibility preferences and applies them to the document.
 * ui-design-plan §3: prefs arrive as `data-*` attributes on <html>, so the whole
 * token-driven UI re-themes with no component changes.
 *
 * Lifecycle: the shell calls load() once after login. Until it resolves, every
 * consumer sees the SAFE defaults (all protections ON) — never the permissive
 * ones. Components read signals; only this service talks HTTP.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly settings = inject(SettingsService);

  /** Null until the first successful load — consumers treat null as "all on". */
  private readonly prefs = signal<UserPreferences | null>(null);

  readonly loaded = computed(() => this.prefs() !== null);
  readonly hideFlashingMedia = computed(() => this.prefs()?.hideFlashingMedia ?? true);
  readonly reduceMotion = computed(() => this.prefs()?.reduceMotion ?? false);
  readonly disableAutoplay = computed(() => this.prefs()?.disableAutoplay ?? true);
  readonly reduceVisualNoise = computed(() => this.prefs()?.reduceVisualNoise ?? false);
  readonly contentPreference = computed(() => this.prefs()?.contentPreference ?? 'General');
  /**
   * Read by the chat composer. Falls back to true while preferences are still loading, which
   * is deliberate: the thread renders before preferences resolve, and defaulting to false here
   * would briefly hand the user a composer whose Enter key does nothing.
   */
  readonly sendMessageOnEnter = computed(() => this.prefs()?.sendMessageOnEnter ?? true);

  /** Fetch once (shell init) and apply. Repeated calls reuse the loaded value. */
  load(): Observable<UserPreferences> {
    if (this.prefs()) {
      return new Observable<UserPreferences>((subscriber) => {
        subscriber.next(this.prefs()!);
        subscriber.complete();
      });
    }
    return this.settings.getPreferences().pipe(tap((prefs) => this.apply(prefs)));
  }

  /** Save a full preference set (PATCH replaces everything) and re-apply. */
  update(prefs: UserPreferences): Observable<UserPreferences> {
    return this.settings.updatePreferences(prefs).pipe(tap((next) => this.apply(next)));
  }

  /** Snapshot for forms to edit (they send the whole set back on save). */
  snapshot(): UserPreferences {
    return (
      this.prefs() ?? {
        hideFlashingMedia: true,
        reduceMotion: false,
        disableAutoplay: true,
        reduceVisualNoise: false,
        contentPreference: 'General',
        sendMessageOnEnter: true,
      }
    );
  }

  private apply(prefs: UserPreferences): void {
    this.prefs.set(prefs);
    const root = document.documentElement;
    root.dataset['reduceMotion'] = String(prefs.reduceMotion);
    root.dataset['reduceVisualNoise'] = String(prefs.reduceVisualNoise);
  }
}
