import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RelativeTimePipe } from '../feed/relative-time.pipe';
import { ApiError } from '../../core/models/api-error';
import { ModerationAction } from '../../core/models/settings.models';
import { AuthError } from '../auth/ui/auth-error';
import { SettingsService } from './settings.service';

/**
 * Moderation & appeals (`/settings/appeals`): your moderation history with a
 * per-action appeal form. Appeals need a reason (server requires it) and are
 * reviewed by a different moderator — both facts stated inline so the form
 * doesn't feel like shouting into a void.
 */
@Component({
  selector: 'fc-appeals',
  imports: [FormsModule, RelativeTimePipe, AuthError],
  templateUrl: './appeals.html',
  styleUrl: './appeals.scss',
})
export class Appeals {
  private readonly settings = inject(SettingsService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly actions = signal<ModerationAction[]>([]);
  protected readonly appealing = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly sending = signal(false);
  protected readonly sentFor = signal<string | null>(null);
  protected readonly sendError = signal<ApiError | null>(null);

  constructor() {
    this.reload();
  }

  protected openAppeal(id: string): void {
    this.appealing.set(id);
    this.reason.set('');
    this.sendError.set(null);
    this.sentFor.set(null);
  }

  protected closeAppeal(): void {
    this.appealing.set(null);
  }

  protected submit(actionId: string): void {
    const reason = this.reason().trim();
    if (!reason || this.sending()) return;
    this.sending.set(true);
    this.sendError.set(null);
    this.settings.submitAppeal({ auditLogId: actionId, reason }).subscribe({
      next: () => {
        this.sending.set(false);
        this.sentFor.set(actionId);
        this.appealing.set(null);
      },
      error: (err: unknown) => {
        this.sendError.set(err instanceof ApiError ? err : null);
        this.sending.set(false);
      },
    });
  }

  protected retry(): void {
    this.error.set(null);
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.settings.myModerationActions().subscribe({
      next: (res) => {
        this.actions.set(res.actions);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }
}
