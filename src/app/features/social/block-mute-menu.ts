import { Component, inject, output, signal, input } from '@angular/core';
import { ApiError } from '../../core/models/api-error';
import { ReportTarget } from '../../core/models/settings.models';
import { ReportDialog } from '../safety/report-dialog';
import { SocialService } from './social.service';

type MenuState = 'idle' | 'saving' | 'confirmBlock' | 'failed';

/**
 * Block / mute menu (components.md §BlockMuteMenu), rendered per user row.
 * Uses a native <details> dropdown — free toggle + keyboard behavior, no focus-trap
 * machinery for a two-item menu.
 *
 * The block flow is the lesson (UI-Plan §2, Profile): the client NEVER pre-checks
 * whether a follow relationship exists. It just POSTs the block:
 *  - 204 → done (parent removes the row — blocked users vanish everywhere).
 *  - 409 `User.BlockRequiresConfirmation` → inline confirm ("You follow each other.
 *    Block anyway?") → resend with `{confirmed: true}`.
 *  - 400 `User.CannotBlockAdmin` → plain message, no confirm offered.
 *
 * Mute is silent by design ("they won't know") — the row flips to Muted in place.
 */
@Component({
  selector: 'fc-block-mute-menu',
  imports: [ReportDialog],
  templateUrl: './block-mute-menu.html',
  styleUrl: './block-mute-menu.scss',
})
export class BlockMuteMenu {
  private readonly social = inject(SocialService);

  username = input.required<string>();
  /** Fires after a confirmed block so the parent can drop the row. */
  readonly blocked = output<string>();
  /** Fires after mute/unmute so the parent can reflect it if it tracks state. */
  readonly muted = output<{ username: string; muted: boolean }>();

  protected readonly state = signal<MenuState>('idle');
  protected readonly mutedNow = signal(false);
  protected readonly notice = signal<string | null>(null);

  protected reportTarget(): ReportTarget {
    return { kind: 'user', username: this.username() };
  }

  protected openReport(dialog: ReportDialog): void {
    dialog.open();
  }

  protected block(): void {
    if (this.state() === 'saving') return;
    this.state.set('saving');
    this.notice.set(null);
    this.social.block(this.username()).subscribe({
      next: () => this.blocked.emit(this.username()),
      error: (err: unknown) => {
        const api = err instanceof ApiError ? err : null;
        if (api?.has('User.BlockRequiresConfirmation')) {
          // THE signal to ask: a follow relationship exists that blocking severs.
          this.state.set('confirmBlock');
        } else {
          // CannotBlockAdmin and friends: show the server's own words.
          this.notice.set(api?.errors[0]?.description ?? 'Something went wrong.');
          this.state.set('failed');
        }
      },
    });
  }

  protected confirmBlock(): void {
    this.state.set('saving');
    this.social.block(this.username(), true).subscribe({
      next: () => this.blocked.emit(this.username()),
      error: (err: unknown) => {
        const api = err instanceof ApiError ? err : null;
        this.notice.set(api?.errors[0]?.description ?? 'Something went wrong.');
        this.state.set('failed');
      },
    });
  }

  protected cancelConfirm(): void {
    this.state.set('idle');
  }

  protected toggleMute(): void {
    if (this.state() === 'saving') return;
    const target = !this.mutedNow();
    this.state.set('saving');
    this.notice.set(null);
    const call = target ? this.social.mute(this.username()) : this.social.unmute(this.username());
    call.subscribe({
      next: () => {
        this.mutedNow.set(target);
        this.state.set('idle');
        this.muted.emit({ username: this.username(), muted: target });
      },
      error: (err: unknown) => {
        const api = err instanceof ApiError ? err : null;
        this.notice.set(api?.errors[0]?.description ?? 'Something went wrong.');
        this.state.set('failed');
      },
    });
  }
}
