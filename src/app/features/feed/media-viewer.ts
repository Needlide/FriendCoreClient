import { Component, computed, inject, input, signal } from '@angular/core';
import { PostMedia } from '../../core/models/posts.models';
import { PreferencesService } from '../../core/preferences/preferences.service';

/**
 * Renders one attached image. Safety rule (content-and-a11y.md §4, API §7.4):
 * when the user's HideFlashingMedia is on and the media carries a
 * flashing/intense-motion flag, render a placeholder and DO NOT set <img src>
 * until the user clicks "Show media" — the browser must never fetch (let alone
 * render) the bytes before explicit consent.
 *
 * Before preferences load, the service defaults to protected (placeholder) —
 * failing safe, never failing open.
 */
@Component({
  selector: 'fc-media-viewer',
  templateUrl: './media-viewer.html',
  styleUrl: './media-viewer.scss',
})
export class MediaViewer {
  private readonly prefs = inject(PreferencesService);

  media = input.required<PostMedia>();

  private readonly revealed = signal(false);

  protected readonly flagged = computed(
    () =>
      this.prefs.hideFlashingMedia() &&
      (this.media().hasFlashingWarning || this.media().hasIntenseMotionWarning),
  );

  /** Feed context → Medium variant, with a fallback chain if the set is partial. */
  protected readonly src = computed(() => {
    const variants = this.media().variants;
    const pick = (...types: string[]) => {
      for (const t of types) {
        const found = variants.find((v) => v.type === t);
        if (found) return found.url;
      }
      return variants[0]?.url ?? '';
    };
    return pick('Medium', 'Small', 'Large', 'Thumbnail');
  });

  protected revealedNow(): boolean {
    return !this.flagged() || this.revealed();
  }

  protected reveal(): void {
    this.revealed.set(true);
  }
}
