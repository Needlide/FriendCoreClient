import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { AdminEndpoints } from '../../core/config/endpoints';
import {
  ActOnUserRequest,
  AppealQueueResponse,
  AuditLogResponse,
  ChangeUserRoleRequest,
  ModerateTagRequest,
  ModerationMetricsResponse,
  ReportQueueResponse,
  ReportResponse,
  ResolveReportRequest,
  ReviewAppealRequest,
  TagModerationQueueResponse,
  UserAccountResponse,
} from '../../core/models/admin.models';

/**
 * Admin moderation transport. Every call is server-gated to Moderator+ (some to Admin only),
 * so 403 is an expected outcome for non-staff — callers handle it, not crash on it.
 *
 * Report/resolve/act-on-user all take a mandatory reason (§10.3); the UI enforces it
 * client-side too so users don't hit a 400 after typing.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = inject(ApiClient);

  // ── Metrics ─────────────────────────────────────────────────────────────

  getMetrics(): Observable<ModerationMetricsResponse> {
    return this.api.get<ModerationMetricsResponse>(AdminEndpoints.metrics);
  }

  // ── Report queue ────────────────────────────────────────────────────────

  getReportQueue(): Observable<ReportQueueResponse> {
    return this.api.get<ReportQueueResponse>(AdminEndpoints.reports);
  }

  getReport(id: string): Observable<ReportResponse> {
    return this.api.get<ReportResponse>(AdminEndpoints.reportById(id));
  }

  resolveReport(id: string, request: ResolveReportRequest): Observable<void> {
    return this.api.post<void>(AdminEndpoints.resolveReport(id), request);
  }

  // ── Appeal queue ────────────────────────────────────────────────────────

  getAppealQueue(): Observable<AppealQueueResponse> {
    return this.api.get<AppealQueueResponse>(AdminEndpoints.appeals);
  }

  reviewAppeal(id: string, request: ReviewAppealRequest): Observable<void> {
    return this.api.post<void>(AdminEndpoints.reviewAppeal(id), request);
  }

  // ── User account + actions ──────────────────────────────────────────────

  getUserAccount(username: string): Observable<UserAccountResponse> {
    return this.api.get<UserAccountResponse>(AdminEndpoints.userAccount(username));
  }

  actOnUser(username: string, request: ActOnUserRequest): Observable<void> {
    return this.api.post<void>(AdminEndpoints.actOnUser(username), request);
  }

  changeUserRole(username: string, request: ChangeUserRoleRequest): Observable<void> {
    return this.api.post<void>(AdminEndpoints.changeUserRole(username), request);
  }

  // ── Audit log ───────────────────────────────────────────────────────────

  getAuditLog(): Observable<AuditLogResponse> {
    return this.api.get<AuditLogResponse>(AdminEndpoints.auditLog);
  }

  // ── Tag moderation queue (under /tags, not /admin) ──────────────────────

  getTagQueue(): Observable<TagModerationQueueResponse> {
    return this.api.get<TagModerationQueueResponse>(AdminEndpoints.tagQueue);
  }

  moderateTag(tagId: string, request: ModerateTagRequest): Observable<void> {
    // The endpoint returns TagResponse (200) but we only care about success.
    return this.api.post<void>(AdminEndpoints.moderateTag(tagId), request);
  }
}
