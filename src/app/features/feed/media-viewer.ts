import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostMedia } from '../../core/models/posts.models';
import { PreferencesService } from '../../core/preferences/preferences.service';
import { MediaVariant } from '../../core/models/posts.models';
import { MediaService } from './media.service';

/**
 * Renders one attached image.
 *
 * The media-safety gate (§7.4, content-and-a11y.md §4) is enforced by the
 * SERVER: flagged media arrives with no variant URLs at all, so there is nothing to render
 * until this component asks for them. That covers flashing, intense motion, arachnophobia,
 * and explicit content. That is deliberate — the old design shipped the flags and let each
 * surface decide, so a surface that forgot would quietly serve the image with nothing to
 * catch the miss. Here a missed gate degrades to a broken image.
 *
 * So the placeholder is not a local `if`: it is the absence of data. There is no <img src>
 * until POST /media/{id}/reveal comes back authorized, so the browser never even requests
 * the bytes before consent.
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
  private readonly mediaService = inject(MediaService);
  private readonly destroyRef = inject(DestroyRef);

  media = input.required<PostMedia>();
  /** Tighter sizing for a chat bubble, where a feed-width image would dominate. */
  compact = input(false);

  private readonly lightbox = viewChild<ElementRef<HTMLDialogElement>>('lightbox');

  /** Variant URLs once the server has issued them; null until then for flagged media. */
  private readonly granted = signal<MediaVariant[] | null>(null);
  protected readonly revealing = signal(false);
  /** Consent refused or failed — the image is gone, and saying so beats an endless spinner. */
  protected readonly revealFailed = signal(false);

  /** True while the server is withholding this image: flagged, and no URLs issued yet. */
  protected readonly gated = computed(
    () => this.media().variants.length === 0 && this.granted() === null,
  );

  /** The URLs actually in hand — what came in the payload, plus anything granted later. */
  private readonly variants = computed<MediaVariant[]>(
    () => this.granted() ?? this.media().variants,
  );

  /**
   * Auto-consent for a reader who has already turned the relevant protection OFF.
   *
   * Which preference is relevant comes from the server's `gateReason`, not from the booleans:
   * flashing is governed by HideFlashingMedia, arachnophobia by HideArachnidMedia, and explicit
   * content by the reader's ContentPreference. Asking about the wrong one would either nag
   * someone who already opted out, or silently show a hazard to someone who asked not to see it.
   *
   * The request still goes to the server, so this is not the client choosing to serve a hazard —
   * it is the client not asking a question that has already been answered.
   */
  private readonly autoReveal = effect(() => {
    const media = this.media();
    // gateReason must be present: without a stated hazard there is no basis for deciding the
    // reader has already consented, so an unexplained empty payload gets no benefit of the doubt.
    if (!this.gated() || !media.gateReason || !this.readerAcceptsGate(media.gateReason)) return;
    this.requestReveal(media.id);
  });

  /**
   * True when the reader has already answered this question, so re-asking would only nag.
   *
   * The hazards are NOT symmetrical here, and getting that wrong is a privacy bug:
   *
   *  - Flashing is governed by HideFlashingMedia, which DEFAULTS TRUE. It is an opt-OUT
   *    preference, so switching it off is a deliberate "show me anyway" and therefore consent.
   *
   *  - Intense motion has no such preference. ReduceMotion is about UI animation and
   *    transitions, and it DEFAULTS FALSE — so reading "off" as consent would auto-reveal
   *    motion to every reader by default, which is precisely the opposite of the protection.
   *    Motion therefore always requires an explicit click until a real opt-out preference
   *    exists (see the open question in docs/claude.md).
   *
   *  - Arachnophobia is opt-out like flashing: HideArachnidMedia defaults TRUE, so switching
   *    it off is consent.
   *
   *  - Explicit content is opt-in: a reader who chose "Everything, including explicit" as
   *    their ContentPreference has already said yes. Everyone else still gets the placeholder
   *    and can consent per image.
   */
  private readerAcceptsGate(reason: string | null): boolean {
    if (!reason) return true; // nothing withheld, or the server did not say why

    // Consent must cover every gated hazard on the item, not just the one the server named in
    // gateReason. Priority decides which label is shown; it must not let one preference answer
    // for another (an image can be both arachnophobia and explicit, for example).
    const flags = this.media().safetyFlags;
    if (flags['explicit'] && this.prefs.contentPreference() !== 'Explicit') return false;
    if (flags['arachnophobia'] && this.prefs.hideArachnidMedia()) return false;
    if (flags['flashing'] && this.prefs.hideFlashingMedia()) return false;

    if (reason === 'IntenseMotion') return false;
    if (reason.includes('Flashing')) return !this.prefs.hideFlashingMedia();
    if (reason === 'Arachnophobia') return !this.prefs.hideArachnidMedia();
    if (reason === 'Explicit') return this.prefs.contentPreference() === 'Explicit';
    return false;
  }

  /**
   * What the reader is being asked to accept, in their terms. One reason at a time is easier to
   * act on than the generic "flashing lights or intense motion" the old copy used for both —
   * and it stops implying a seizure risk for an image that only moves.
   */
  protected gateTitle(): string {
    switch (this.media().gateReason) {
      case 'Flashing':
        return 'Flashing lights';
      case 'IntenseMotion':
        return 'Fast movement';
      case 'FlashingAndIntenseMotion':
        return 'Flashing lights and fast movement';
      case 'Arachnophobia':
        return 'Spiders or arachnids';
      case 'Explicit':
        return 'Explicit content';
      default:
        return 'Sensitive media';
    }
  }

  protected gateBody(): string {
    switch (this.media().gateReason) {
      case 'Flashing':
        return 'This image may contain flashing lights, which can trigger seizures.';
      case 'IntenseMotion':
        return 'This animation moves a lot, which can be uncomfortable.';
      case 'FlashingAndIntenseMotion':
        return 'This image may contain flashing lights and fast movement.';
      case 'Arachnophobia':
        return 'This image may contain spiders or other arachnids, which can be distressing.';
      case 'Explicit':
        return 'This image may contain nudity or sexually explicit material.';
      default:
        return 'This media may contain content you asked not to see.';
    }
  }

  /** Consent, requested from the server. Never optimistic: there is no URL to show until the
   *  server says this reader may have it, which is the entire point of the arrangement. */
  protected reveal(): void {
    this.requestReveal(this.media().id);
  }

  private requestReveal(mediaId: string): void {
    if (this.revealing() || this.revealFailed()) return;
    this.revealing.set(true);
    this.mediaService
      .reveal(mediaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (granted) => {
          this.granted.set(granted.variants);
          this.revealing.set(false);
        },
        error: () => {
          // 404 means the server declined: not entitled, or removed since.
          this.revealing.set(false);
          this.revealFailed.set(true);
        },
      });
  }

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
    return !this.gated();
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
    const variants = this.variants();
    for (const type of types) {
      const found = variants.find((v) => v.type === type);
      if (found) return found.url;
    }
    return variants[0]?.url ?? '';
  }
}
