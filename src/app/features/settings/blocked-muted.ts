import { Component, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ApiError } from '../../core/models/api-error';
import { UserSummary } from '../../core/models/profile.models';
import { AuthError } from '../auth/ui/auth-error';
import { SocialService } from '../social/social.service';

/**
 * Blocks & mutes (`/settings/safety`): the management surface that makes both actions
 * reversible. A blocked profile is a 404 everywhere else, so this page is the only
 * place a blocked person can be found and unblocked.
 *
 * Both lists load together: they are two halves of the same safety screen, and a
 * half-loaded page would make an empty section look like lost data.
 */
@Component({
  selector: 'fc-blocked-muted',
  imports: [AuthError],
  templateUrl: './blocked-muted.html',
  styleUrl: './blocked-muted.scss',
})
export class BlockedMuted {
  private readonly social = inject(SocialService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly actionError = signal<ApiError | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly blocked = signal<UserSummary[]>([]);
  protected readonly muted = signal<UserSummary[]>([]);
  protected readonly busy = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  protected retry(): void {
    this.error.set(null);
    this.reload();
  }

  protected unblock(person: UserSummary): void {
    const key = `block:${person.username}`;
    if (this.busy()) return;
    this.busy.set(key);
    this.actionError.set(null);
    this.notice.set(null);
    this.social.unblock(person.username).subscribe({
      next: () => {
        this.blocked.update((people) =>
          people.filter((candidate) => candidate.username !== person.username),
        );
        this.busy.set(null);
        this.notice.set(`Unblocked @${person.username}.`);
      },
      error: (err: unknown) => {
        this.actionError.set(err instanceof ApiError ? err : null);
        this.busy.set(null);
      },
    });
  }

  protected unmute(person: UserSummary): void {
    const key = `mute:${person.username}`;
    if (this.busy()) return;
    this.busy.set(key);
    this.actionError.set(null);
    this.notice.set(null);
    this.social.unmute(person.username).subscribe({
      next: () => {
        this.muted.update((people) =>
          people.filter((candidate) => candidate.username !== person.username),
        );
        this.busy.set(null);
        this.notice.set(`Unmuted @${person.username}.`);
      },
      error: (err: unknown) => {
        this.actionError.set(err instanceof ApiError ? err : null);
        this.busy.set(null);
      },
    });
  }

  protected initials(displayName: string): string {
    const name = displayName.trim();
    return name.length > 0 ? name[0]!.toUpperCase() : '?';
  }

  private reload(): void {
    this.loading.set(true);
    this.actionError.set(null);
    this.notice.set(null);
    forkJoin({
      blocks: this.social.getBlocks(),
      mutes: this.social.getMutes(),
    }).subscribe({
      next: ({ blocks, mutes }) => {
        this.blocked.set(blocks.users);
        this.muted.set(mutes.users);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }
}
