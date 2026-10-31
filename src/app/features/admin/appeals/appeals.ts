import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RelativeTimePipe } from '../../feed/relative-time.pipe';
import { ApiError } from '../../../core/models/api-error';
import { AuthError } from '../../auth/ui/auth-error';
import { AdminService } from '../admin.service';
import {
  AppealQueueResponse,
  AppealResponse,
  ReviewAppealRequest,
  APPEAL_OUTCOMES,
  APPEAL_STATUS_ORDER,
} from '../../../core/models/admin.models';

/**
 * Appeal queue (`/admin/appeals`): appeals awaiting review, sorted by deadline then age.
 * Review an appeal: uphold, partially uphold, or overturn — review note mandatory.
 */
@Component({
  selector: 'fc-admin-appeals',
  imports: [FormsModule, RelativeTimePipe, AuthError],
  templateUrl: './appeals.html',
  styleUrl: './appeals.scss',
})
export class Appeals {
  protected readonly APPEAL_OUTCOMES = APPEAL_OUTCOMES;
  protected readonly APPEAL_STATUS_ORDER = APPEAL_STATUS_ORDER;
  private readonly admin = inject(AdminService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly appeals = signal<AppealResponse[]>([]);

  /** Selected appeal for the review panel. */
  protected readonly selected = signal<AppealResponse | null>(null);
  protected readonly reviewing = signal<string | null>(null); // appeal id in flight
  protected readonly reviewError = signal<ApiError | null>(null);

  /** Review form state. */
  protected readonly reviewOutcome = signal<ReviewAppealRequest['outcome']>('Upheld');
  protected readonly reviewNote = signal('');

  constructor() {
    this.reload();
  }

  protected retry(): void {
    this.error.set(null);
    this.reload();
  }

  protected open(appeal: AppealResponse): void {
    this.selected.set(appeal);
    this.reviewError.set(null);
    this.resetReviewForm();
  }

  protected close(): void {
    this.selected.set(null);
  }

  protected isOutcomeDisabled(outcome: ReviewAppealRequest['outcome']): boolean {
    const appeal = this.selected();
    return appeal ? appeal.status !== 'Pending' : true;
  }

  protected review(): void {
    const appeal = this.selected();
    if (!appeal || this.reviewing() === appeal.id) return;

    const note = this.reviewNote().trim();
    if (!note) return;

    const request: ReviewAppealRequest = {
      outcome: this.reviewOutcome(),
      note,
    };

    this.reviewing.set(appeal.id);
    this.reviewError.set(null);
    this.admin.reviewAppeal(appeal.id, request).subscribe({
      next: () => {
        this.reviewing.set(null);
        this.selected.set(null);
        this.reload();
      },
      error: (err: unknown) => {
        this.reviewError.set(err instanceof ApiError ? err : null);
        this.reviewing.set(null);
      },
    });
  }

  protected resetReviewForm(): void {
    this.reviewOutcome.set('Upheld');
    this.reviewNote.set('');
  }

  private reload(): void {
    this.loading.set(true);
    this.admin.getAppealQueue().subscribe({
      next: (res) => {
        const sorted = [...res.appeals].sort((a: AppealResponse, b: AppealResponse) => {
          const sa = APPEAL_STATUS_ORDER[a.status] ?? 9;
          const sb = APPEAL_STATUS_ORDER[b.status] ?? 9;
          if (sa !== sb) return sa - sb;
          return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0;
        });
        this.appeals.set(sorted);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }
}
