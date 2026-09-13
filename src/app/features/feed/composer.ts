import { Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models/api-error';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_MEDIA_BYTES,
  MAX_POST_LENGTH,
  MAX_POST_TAGS,
  MediaUploadResponse,
  Post,
  PostSensitivity,
  UploadProgress,
} from '../../core/models/posts.models';
import { TagInput } from '../tags/tag-input';
import { AuthError } from '../auth/ui/auth-error';
import { FeedService } from './feed.service';
import { MediaService } from './media.service';

type AttachmentState =
  | { kind: 'uploading'; percent: number; preview: string }
  | { kind: 'processing'; preview: string }
  | { kind: 'ready'; mediaId: string; preview: string }
  | { kind: 'failed'; preview: string; message: string };

/**
 * Post composer (components.md §PostComposer). Three independent concerns, kept as
 * three independent pieces of state:
 *  1. text + sensitivity + tags — a plain reactive form;
 *  2. ONE attachment with its own lifecycle (uploading → processing → ready/failed);
 *  3. publish + the email-verification gate.
 *
 * Single-attachment MVP: the API supports several media ids, but one polished slot
 * beats three buggy ones. `mediaIds: [readyId]` already generalizes when slot 2 arrives.
 *
 * Verify gate: posting while unverified returns 400 `User.EmailNotVerified` (the ONLY
 * gated action — likes/comments/follows are not). We surface a calm banner with a
 * resend action instead of a dead error, per UI-Plan §2.
 */
@Component({
  selector: 'fc-composer',
  imports: [ReactiveFormsModule, TagInput, AuthError],
  templateUrl: './composer.html',
  styleUrl: './composer.scss',
})
export class Composer {
  private readonly feed = inject(FeedService);
  private readonly media = inject(MediaService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  /** Fires with the created post so the feed can prepend it without refetching. */
  readonly postCreated = output<Post>();

  protected readonly maxLength = MAX_POST_LENGTH;
  protected readonly maxTags = MAX_POST_TAGS;

  protected readonly form = this.fb.nonNullable.group({
    content: ['', Validators.maxLength(MAX_POST_LENGTH)],
    sensitivity: ['General' as PostSensitivity, Validators.required],
  });

  protected readonly tags = signal<string[]>([]);
  protected readonly attachment = signal<AttachmentState | null>(null);
  /** Creator self-declaration (API §7.4 three-layer safety, layer 1). */
  protected readonly warnFlashing = signal(false);
  protected readonly warnMotion = signal(false);
  /**
   * Reactive verification state (from the session, not a one-shot fetch).
   * The notice renders BEFORE anything is typed — the old design only reacted to
   * the 400 after publish, i.e. after the user had already spent the effort.
   * Typing stays enabled (never destroy work); only publishing waits.
   */
  protected readonly verified = this.auth.isEmailVerified;
  protected readonly checking = signal(false);
  protected readonly stillUnverified = signal(false);
  protected readonly publishing = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly needsVerification = signal(false);
  protected readonly resendEmail = signal('');
  protected readonly resending = signal(false);
  protected readonly resent = signal(false);

  protected canPublish(): boolean {
    const att = this.attachment();
    const busy = att !== null && att.kind !== 'ready' && att.kind !== 'failed';
    const hasContent = this.form.controls.content.value.trim().length > 0;
    const hasMedia = att !== null && att.kind === 'ready';
    // Posting is the one verified-only action: gate here (with explanation above),
    // not after the effort. The 400 branch in publish() stays as a race backup.
    return !this.publishing() && !busy && this.verified() && (hasContent || hasMedia);
  }

  protected addTag(name: string): void {
    const clean = name.trim();
    if (!clean) return;
    if (this.tags().length >= MAX_POST_TAGS) return;
    if (this.tags().some((t) => t.toLowerCase() === clean.toLowerCase())) return;
    this.tags.update((tags) => [...tags, clean]);
  }

  protected removeTag(name: string): void {
    this.tags.update((tags) => tags.filter((t) => t !== name));
  }

  /** File picker handler: fast client checks, then upload-with-progress → poll. */
  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file after remove/failure
    if (!file || this.attachmentBusy()) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      this.attachment.set({
        kind: 'failed',
        preview: '',
        message: 'Only JPEG, PNG, WebP, or GIF images (up to 20 MB).',
      });
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      this.attachment.set({
        kind: 'failed',
        preview: '',
        message: 'That file is over 20 MB.',
      });
      return;
    }

    const preview = URL.createObjectURL(file);
    this.attachment.set({ kind: 'uploading', percent: 0, preview });
    const flags = {
      hasFlashingWarning: this.warnFlashing(),
      hasIntenseMotionWarning: this.warnMotion(),
    };
    this.media.upload(file, flags).subscribe({
      next: (event) => {
        if (isProgress(event)) {
          this.attachment.set({ kind: 'uploading', percent: event.percent, preview });
        } else {
          this.pollUntilReady(event, preview);
        }
      },
      error: () => {
        URL.revokeObjectURL(preview);
        this.attachment.set({ kind: 'failed', preview: '', message: 'Upload failed. Try again.' });
      },
    });
  }

  private attachmentBusy(): boolean {
    const att = this.attachment();
    return att !== null && (att.kind === 'uploading' || att.kind === 'processing');
  }

  /** Upload finished (bytes are on the server) — now wait for variants. */
  private pollUntilReady(uploaded: MediaUploadResponse, preview: string): void {
    this.attachment.set({ kind: 'processing', preview });
    this.media.waitUntilReady(uploaded.id).subscribe({
      next: (status) => {
        if (status.status === 'Ready') {
          this.attachment.set({ kind: 'ready', mediaId: uploaded.id, preview });
        } else {
          URL.revokeObjectURL(preview);
          this.attachment.set({
            kind: 'failed',
            preview: '',
            message: 'The image could not be processed. Try another file.',
          });
        }
      },
      error: () => {
        URL.revokeObjectURL(preview);
        this.attachment.set({
          kind: 'failed',
          preview: '',
          message: 'Timed out waiting for the image. Try again.',
        });
      },
    });
  }
  /** Template helpers — the @switch narrows `kind`, but bindings need plain values. */
  protected attachmentPercent(): number {
    const att = this.attachment();
    return att?.kind === 'uploading' ? att.percent : 0;
  }

  protected attachmentMessage(): string {
    const att = this.attachment();
    return att?.kind === 'failed' ? att.message : '';
  }

  protected removeAttachment(): void {
    const att = this.attachment();
    if (att && 'preview' in att && att.preview) URL.revokeObjectURL(att.preview);
    if (att && att.kind === 'ready') {
      // Best-effort cleanup of the orphaned server upload; the composer works
      // regardless of the outcome, so the result is ignored.
      this.media.deleteMedia(att.mediaId).subscribe();
    }
    this.attachment.set(null);
  }

  protected publish(): void {
    if (!this.canPublish()) return;
    this.publishing.set(true);
    this.error.set(null);
    this.needsVerification.set(false);

    const att = this.attachment();
    this.feed
      .createPost({
        content: this.form.controls.content.value.trim() || null,
        sensitivity: this.form.controls.sensitivity.value,
        mediaIds: att && att.kind === 'ready' ? [att.mediaId] : [],
        tags: this.tags(),
      })
      .subscribe({
        next: (post) => {
          this.publishing.set(false);
          this.reset();
          this.postCreated.emit(post);
        },
        error: (err: unknown) => {
          this.publishing.set(false);
          const api = err instanceof ApiError ? err : null;
          // THE gated action: posting is the only endpoint that requires a verified
          // email. Branch on the code (not the status) and show the resend path.
          if (api?.has('User.EmailNotVerified')) this.needsVerification.set(true);
          else this.error.set(api);
        },
      });
  }

  /** Re-fetch the session after verifying elsewhere (e.g. on the phone). */
  protected recheckVerification(): void {
    if (this.checking() || this.cooling()) return;
    this.checking.set(true);
    this.stillUnverified.set(false);
    this.auth.refresh().subscribe({
      next: () => {
        this.checking.set(false);
        // Session signal drives `verified()` — if still false, say so plainly.
        if (!this.verified()) this.stillUnverified.set(true);
        this.startCooldown();
      },
      error: () => {
        this.checking.set(false);
        this.startCooldown();
      },
    });
  }

  /**
   * Post-attempt cooldown (5 s): refresh() is cheap but not free, and hammering it
   * doubles as a (very polite) self-DoS on the auth path. The button disables for
   * the window; the last result message persists so the state never looks dead.
   */
  protected readonly cooling = signal(false);

  private startCooldown(): void {
    this.cooling.set(true);
    setTimeout(() => this.cooling.set(false), 5_000);
  }

  protected resendVerification(): void {
    // The server stores no address, so resending needs the email typed in.
    // A mismatch is a blind success — the banner confirms neutrally either way.
    const email = this.resendEmail().trim();
    if (this.resending() || !email) return;
    this.resending.set(true);
    this.auth.resendVerification(email).subscribe({
      next: () => {
        this.resending.set(false);
        this.resent.set(true);
      },
      error: () => this.resending.set(false),
    });
  }

  private reset(): void {
    const att = this.attachment();
    if (att && 'preview' in att && att.preview) URL.revokeObjectURL(att.preview);
    this.form.reset({ content: '', sensitivity: 'General' as PostSensitivity });
    this.tags.set([]);
    this.attachment.set(null);
    this.needsVerification.set(false);
    this.resent.set(false);
  }
}

function isProgress(event: UploadProgress | MediaUploadResponse): event is UploadProgress {
  return (
    (event as UploadProgress).percent !== undefined &&
    (event as MediaUploadResponse).id === undefined
  );
}
