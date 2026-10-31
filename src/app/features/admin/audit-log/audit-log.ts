import { Component, inject, signal } from '@angular/core';
import { RelativeTimePipe } from '../../feed/relative-time.pipe';
import { ApiError } from '../../../core/models/api-error';
import { AuthError } from '../../auth/ui/auth-error';
import { AdminService } from '../admin.service';
import { AuditLogResponse } from '../../../core/models/admin.models';

/**
 * Audit log (`/admin/audit-log`): every moderator action, immutable, newest first.
 * Who did what, to whom, why, and from which IP — the mandatory record (§10.3).
 */
@Component({
  selector: 'fc-admin-audit-log',
  imports: [RelativeTimePipe, AuthError],
  templateUrl: './audit-log.html',
  styleUrl: './audit-log.scss',
})
export class AuditLog {
  private readonly admin = inject(AdminService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly entries = signal<AuditLogResponse['entries']>([]);

  constructor() {
    this.reload();
  }

  protected retry(): void {
    this.error.set(null);
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.admin.getAuditLog().subscribe({
      next: (res) => {
        this.entries.set([...res.entries].reverse()); // newest first
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }
}
