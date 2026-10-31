import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RelativeTimePipe } from '../../feed/relative-time.pipe';
import { ApiError } from '../../../core/models/api-error';
import { AuthError } from '../../auth/ui/auth-error';
import { AdminService } from '../admin.service';
import {
  UserAccountResponse,
  USER_ACTIONS,
  AuditLogEntryResponse,
  ActOnUserRequest,
  ChangeUserRoleRequest,
} from '../../../core/models/admin.models';

/**
 * User account (`/admin/users`): look up any account by username, view its enforcement
 * state and moderation history, then act on it (warning, suspension, ban, legal referral)
 * or change its role (Admin-only). Reason is mandatory on every action.
 */
@Component({
  selector: 'fc-admin-users',
  imports: [FormsModule, RelativeTimePipe, AuthError],
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export class Users {
  protected readonly USER_ACTIONS = USER_ACTIONS;
  private readonly admin = inject(AdminService);

  protected readonly loading = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly account = signal<UserAccountResponse | null>(null);

  protected readonly username = signal('');
  protected readonly searching = signal(false);

  /** Act-on-user form state. */
  protected readonly actAction = signal<ActOnUserRequest['action']>('Warning');
  protected readonly actReason = signal('');
  protected readonly actSuspensionDays = signal<number | null>(null);
  protected readonly acting = signal<string | null>(null); // 'acting' or null

  /** Change-role form state (Admin-only server-side). */
  protected readonly roleAction = signal<ChangeUserRoleRequest['role']>('Moderator');
  protected readonly roleReason = signal('');
  protected readonly roleChanging = signal(false);

  protected needsSuspensionDays(action: ActOnUserRequest['action']): boolean {
    return USER_ACTIONS.find((a) => a.value === action)?.needsSuspensionDays ?? false;
  }

  protected lookup(): void {
    const u = this.username().trim();
    if (!u || this.searching()) return;

    this.searching.set(true);
    this.error.set(null);
    this.account.set(null);

    this.admin.getUserAccount(u).subscribe({
      next: (res) => {
        this.account.set(res);
        this.searching.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.searching.set(false);
      },
    });
  }

  protected actOnUser(): void {
    const account = this.account();
    if (!account || this.acting()) return;

    const reason = this.actReason().trim();
    if (!reason) return;

    const request: ActOnUserRequest = {
      action: this.actAction(),
      reason,
    };
    if (this.needsSuspensionDays(this.actAction())) {
      request.suspensionDays = this.actSuspensionDays() ?? undefined;
    }

    this.acting.set(account.username);
    this.admin.actOnUser(account.username, request).subscribe({
      next: () => {
        this.acting.set(null);
        this.lookup(); // refresh to show new state
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.acting.set(null);
      },
    });
  }

  protected changeRole(): void {
    const account = this.account();
    if (!account || this.roleChanging()) return;

    const reason = this.roleReason().trim();
    if (!reason) return;

    const request: ChangeUserRoleRequest = {
      role: this.roleAction(),
      reason,
    };

    this.roleChanging.set(true);
    this.admin.changeUserRole(account.username, request).subscribe({
      next: () => {
        this.roleChanging.set(false);
        this.lookup(); // refresh to show new role
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.roleChanging.set(false);
      },
    });
  }
}
