import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RelativeTimePipe } from '../../feed/relative-time.pipe';
import { ApiError } from '../../../core/models/api-error';
import { AuthError } from '../../auth/ui/auth-error';
import { AdminService } from '../admin.service';
import {
  ReportQueueResponse,
  ReportResponse,
  ResolveReportRequest,
  RESOLVE_ACTIONS,
  PRIORITY_ORDER,
} from '../../../core/models/admin.models';

/**
 * Report queue (`/admin/reports`): pending reports sorted by priority then age.
 * Click a report to see its subject snapshot and resolve it (content removal,
 * warning, suspension, ban, dismissal — reason mandatory, server-enforced).
 */
@Component({
  selector: 'fc-admin-reports',
  imports: [FormsModule, RelativeTimePipe, AuthError],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  protected readonly RESOLVE_ACTIONS = RESOLVE_ACTIONS;
  protected readonly PRIORITY_ORDER = PRIORITY_ORDER;
  private readonly admin = inject(AdminService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly reports = signal<ReportResponse[]>([]);

  /** Selected report for the detail/resolve panel. Null when closed. */
  protected readonly selected = signal<ReportResponse | null>(null);
  protected readonly resolving = signal<string | null>(null); // report id in flight
  protected readonly resolveError = signal<ApiError | null>(null);

  /** Resolve form state. */
  protected readonly resolveAction = signal<ResolveReportRequest['action']>('Dismiss');
  protected readonly resolveReason = signal('');
  protected readonly resolveSuspensionDays = signal<number | null>(null);

  constructor() {
    this.reload();
  }

  protected retry(): void {
    this.error.set(null);
    this.reload();
  }

  protected open(report: ReportResponse): void {
    this.selected.set(report);
    this.resolveError.set(null);
    this.resetResolveForm();
  }

  protected close(): void {
    this.selected.set(null);
  }

  protected isActionDisabled(action: ResolveReportRequest['action']): boolean {
    // Can't resolve an already-resolved report optimistically.
    const report = this.selected();
    return report ? report.status !== 'Pending' : true;
  }

  protected needsSuspensionDays(action: ResolveReportRequest['action']): boolean {
    return RESOLVE_ACTIONS.find((a) => a.value === action)?.needsSuspensionDays ?? false;
  }

  protected resolve(): void {
    const report = this.selected();
    if (!report || this.resolving() === report.id) return;

    const reason = this.resolveReason().trim();
    if (!reason) return;

    const request: ResolveReportRequest = {
      action: this.resolveAction(),
      reason,
    };
    if (this.needsSuspensionDays(this.resolveAction())) {
      request.suspensionDays = this.resolveSuspensionDays() ?? undefined;
    }

    this.resolving.set(report.id);
    this.resolveError.set(null);
    this.admin.resolveReport(report.id, request).subscribe({
      next: () => {
        this.resolving.set(null);
        this.selected.set(null);
        this.reload();
      },
      error: (err: unknown) => {
        this.resolveError.set(err instanceof ApiError ? err : null);
        this.resolving.set(null);
      },
    });
  }

  protected resetResolveForm(): void {
    this.resolveAction.set('Dismiss');
    this.resolveReason.set('');
    this.resolveSuspensionDays.set(null);
  }

  private reload(): void {
    this.loading.set(true);
    this.admin.getReportQueue().subscribe({
      next: (res) => {
        const sorted = [...res.reports].sort((a: ReportResponse, b: ReportResponse) => {
          const pa = PRIORITY_ORDER[a.priority] ?? 9;
          const pb = PRIORITY_ORDER[b.priority] ?? 9;
          if (pa !== pb) return pa - pb;
          return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
        });
        this.reports.set(sorted);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }

  /** Human label for a category value. */
  protected categoryLabel(value: string): string {
    const map: Record<string, string> = {
      Spam: 'Spam or fake',
      Harassment: 'Harassment or hateful content',
      NudityOrSexual: 'Nudity or sexual content',
      ViolenceOrDangerous: 'Violence or dangerous activity',
      PrivateInformation: 'Private information',
      Copyright: 'Copyright violation',
      InvolvesMinor: 'Involves a minor',
      FlashingLights: 'Flashing lights or intense motion',
      Other: 'Something else',
    };
    return map[value] ?? value;
  }

  /** Truncate subject content for the list preview. */
  protected subjectPreview(subject: ReportResponse['subject']): string {
    if (!subject) return 'Content unavailable';
    return subject.content.length > 120 ? subject.content.slice(0, 120) + '…' : subject.content;
  }
}
