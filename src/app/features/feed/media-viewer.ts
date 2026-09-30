import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
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
 *
 * Two sizes come out of ONE response, which is why the variants exist:
 *  - inline (`src`): Small in a chat bubble, Medium in a feed card.
 *  - full size (`fullSrc`): the Large variant, in a native <dialog>. Without it
 *    a 4000px photo shared in a DM could only ever be seen at 300px wide.
 *
 * The dialog is native for the same reason ReportDialog uses one: showModal()
 * gives the focus trap, Escape-to-close, and inert background for free. It shows
 * Large, not the preserved original — the original is stored but never exposed by
 * URL, and minting a presigned one would need a real authorization decision
 * (a DM image is only visible to conversation participants) rather than a token
 * in a payload anyone can request.
 */
@Component({
  selector: 'fc-media-viewer',
  templateUrl: './media-viewer.html',
  styleUrl: './media-viewer.scss',
})
export class MediaViewer {
  private readonly prefs = inject(PreferencesService);

  media = input.required<PostMedia>();
  /** Tighter sizing for a chat bubble, where a feed-width image would dominate. */
  compact = input(false);

  private readonly revealed = signal(false);
  private readonly lightbox = viewChild<ElementRef<HTMLDialogElement>>('lightbox');

  protected readonly flagged = computed(
    () =>
      this.prefs.hideFlashingMedia() &&
      (this.media().hasFlashingWarning || this.media().hasIntenseMotionWarning),
  );

  /** Inline source. Fallback chain in case the variant set is ever partial. */
  protected readonly src = computed(() => {
    const order = this.compact()
      ? ['Small', 'Medium', 'Thumbnail', 'Large']
      : ['Medium', 'Small', 'Large', 'Thumbnail'];
    return this.pick(...order);
  });

  /** Full-size source for the dialog. Large is the widest variant the API returns. */
  protected readonly fullSrc = computed(() => this.pick('Large', 'Medium', 'Small', 'Thumbnail'));

  protected revealedNow(): boolean {
    return !this.flagged() || this.revealed();
  }

  protected reveal(): void {
    this.revealed.set(true);
  }

  protected open(): void {
    this.lightbox()?.nativeElement.showModal();
  }

  protected close(): void {
    this.lightbox()?.nativeElement.close();
  }

  /** Clicking the backdrop lands on the dialog itself, not on the image inside it. */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.lightbox()?.nativeElement) this.close();
  }

  private pick(...types: string[]): string {
    const variants = this.media().variants;
    for (const type of types) {
      const found = variants.find((v) => v.type === type);
      if (found) return found.url;
    }
    return variants[0]?.url ?? '';
  }
}
