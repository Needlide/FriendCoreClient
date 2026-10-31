import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../../core/models/api-error';
import { AuthError } from '../../auth/ui/auth-error';
import { AdminService } from '../admin.service';
import { ModerationMetricsResponse } from '../../../core/models/admin.models';

/**
 * Admin dashboard (`/admin/dashboard`): headline metrics — report queue volume,
 * appeal queue, overturn rate, total moderation actions. Quick links into each queue.
 */
@Component({
  selector: 'fc-admin-dashboard',
  imports: [DecimalPipe, RouterLink, AuthError],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard {
  private readonly admin = inject(AdminService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly metrics = signal<ModerationMetricsResponse | null>(null);

  constructor() {
    this.reload();
  }

  protected retry(): void {
    this.error.set(null);
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.admin.getMetrics().subscribe({
      next: (res) => {
        this.metrics.set(res);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }
}
