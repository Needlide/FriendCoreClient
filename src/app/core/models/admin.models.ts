/**
 * Admin moderation contracts. Mirror the API exactly (camelCase) — do not rename fields.
 *
 * All fields are server-authoritative. The client never synthesizes IDs, cursors, or
 * timestamps; it echoes them back verbatim.
 */

import { UserSummary } from './profile.models';

/** One report in the queue, as returned by GET /admin/reports. */
export interface ReportSubjectResponse {
  kind: string;           // Post | Comment | Message | Media
  content: string;
  authorUsername: string | null;
  capturedAt: string;
}

export interface ReportResponse {
  id: string;
  targetType: string;     // Post | User | Message | Media
  targetId: string;
  category: string;       // Spam | Harassment | NudityOrSexual | ... | Other
  priority: string;       // High | Medium | Low
  status: string;         // Pending | Resolved | Dismissed
  note: string | null;
  reporter: UserSummary;
  subject: ReportSubjectResponse | null;
  createdAt: string;
}

export interface ReportQueueResponse {
  reports: ReportResponse[];
}

/** One appeal in the queue, as returned by GET /admin/appeals. */
export interface AppealResponse {
  id: string;
  auditLogId: string;
  appellant: UserSummary;
  reason: string;
  status: string;         // Pending | Upheld | PartiallyUpheld | Overturned
  deadline: string;
  createdAt: string;
}

export interface AppealQueueResponse {
  appeals: AppealResponse[];
}

/** GET /admin/users/{username} — identity, enforcement state, moderation history. */
export interface AuditLogEntryResponse {
  id: string;
  moderator: UserSummary;
  action: string;         // ContentRemoval | Warning | ... | RoleChanged
  targetType: string;     // User | Post | Comment | Message | Media | Report | Appeal
  targetId: string;
  reason: string;
  ipAddress: string | null;
  relatedReportId: string | null;
  createdAt: string;
}

export interface UserAccountResponse {
  userId: string;
  username: string;
  displayName: string;
  role: string;           // User | Moderator | SeniorModerator | Admin
  isVerified: boolean;
  isBanned: boolean;
  suspendedUntil: string | null;
  createdAt: string;
  moderationHistory: AuditLogEntryResponse[];
}

/** GET /admin/audit-log — every moderator action, immutable. */
export interface AuditLogResponse {
  entries: AuditLogEntryResponse[];
}

/** GET /admin/metrics — dashboard aggregates. */
export interface ReportMetricsResponse {
  total: number;
  pending: number;
  resolved: number;
  dismissed: number;
  avgResolutionHours: number | null;
}

export interface AppealMetricsResponse {
  total: number;
  pending: number;
  reviewed: number;
  overturned: number;
  overturnRate: number;
  avgResolutionHours: number | null;
}

export interface ModerationMetricsResponse {
  reports: ReportMetricsResponse;
  appeals: AppealMetricsResponse;
  totalModerationActions: number;
}

/** GET /tags/moderation/queue — pending tags awaiting approval. */
export interface TagModerationQueueItem {
  tagId: string;
  name: string;
  slug: string;
  createdAt: string;
  createdById: string;
  creatorUsername: string | null;
  creatorDisplayName: string | null;
}

export interface TagModerationQueueResponse {
  tags: TagModerationQueueItem[];
}

/** Request bodies mirror the server contracts (ModerationActionInput etc.). */
export type ModerationAction =
  | 'ContentRemoval'
  | 'Warning'
  | 'TemporaryRestriction'
  | 'TemporarySuspension'
  | 'PermanentBan'
  | 'LegalReferral'
  | 'Dismiss';

export type AppealOutcome = 'Upheld' | 'PartiallyUpheld' | 'Overturned';

export type UserRole = 'User' | 'Moderator' | 'SeniorModerator' | 'Admin';

export type TagModerationAction = 'Approve' | 'Archive' | 'Ban';

export interface ResolveReportRequest {
  action: ModerationAction;
  reason: string;
  suspensionDays?: number;
}

export interface ReviewAppealRequest {
  outcome: AppealOutcome;
  note: string;
}

export interface ActOnUserRequest {
  action: ModerationAction;
  reason: string;
  suspensionDays?: number;
}

export interface ChangeUserRoleRequest {
  role: UserRole;
  reason: string;
}

export interface ModerateTagRequest {
  action: TagModerationAction;
}

/** User-facing labels for the report categories (mirrors settings.models REPORT_CATEGORIES). */
export const REPORT_CATEGORIES_ADMIN = [
  { value: 'Spam', label: 'Spam or fake' },
  { value: 'Harassment', label: 'Harassment or hateful content' },
  { value: 'NudityOrSexual', label: 'Nudity or sexual content' },
  { value: 'ViolenceOrDangerous', label: 'Violence or dangerous activity' },
  { value: 'PrivateInformation', label: 'Private information' },
  { value: 'Copyright', label: 'Copyright violation' },
  { value: 'InvolvesMinor', label: 'Involves a minor' },
  { value: 'FlashingLights', label: 'Flashing lights or intense motion' },
  { value: 'Other', label: 'Something else' },
] as const;

/** Enforcement actions available when resolving a report (against the subject's author). */
export const RESOLVE_ACTIONS: { value: ModerationAction; label: string; needsSuspensionDays: boolean }[] = [
  { value: 'Dismiss', label: 'Dismiss (no action)', needsSuspensionDays: false },
  { value: 'Warning', label: 'Warning', needsSuspensionDays: false },
  { value: 'ContentRemoval', label: 'Remove the content', needsSuspensionDays: false },
  { value: 'TemporaryRestriction', label: 'Temporary restriction', needsSuspensionDays: false },
  { value: 'TemporarySuspension', label: 'Temporary suspension', needsSuspensionDays: true },
  { value: 'PermanentBan', label: 'Permanent ban', needsSuspensionDays: false },
  { value: 'LegalReferral', label: 'Legal referral', needsSuspensionDays: false },
] as const;

/** Enforcement actions available when acting on a user account. */
export const USER_ACTIONS: { value: ModerationAction; label: string; needsSuspensionDays: boolean }[] = [
  { value: 'Warning', label: 'Warning', needsSuspensionDays: false },
  { value: 'TemporaryRestriction', label: 'Temporary restriction', needsSuspensionDays: false },
  { value: 'TemporarySuspension', label: 'Temporary suspension', needsSuspensionDays: true },
  { value: 'PermanentBan', label: 'Permanent ban', needsSuspensionDays: false },
  { value: 'LegalReferral', label: 'Legal referral', needsSuspensionDays: false },
] as const;

/** Appeal outcomes. */
export const APPEAL_OUTCOMES: { value: AppealOutcome; label: string }[] = [
  { value: 'Upheld', label: 'Upheld (enforcement stands)' },
  { value: 'PartiallyUpheld', label: 'Partially upheld' },
  { value: 'Overturned', label: 'Overturned (reverse enforcement)' },
] as const;

/** Tag moderation actions. */
export const TAG_MODERATION_ACTIONS: { value: TagModerationAction; label: string }[] = [
  { value: 'Approve', label: 'Approve (make public)' },
  { value: 'Archive', label: 'Archive (hide from autocomplete)' },
  { value: 'Ban', label: 'Ban (block tag entirely)' },
] as const;

/** Priority display order for sorting the report queue. */
export const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

/** Status display order for the appeal queue. */
export const APPEAL_STATUS_ORDER: Record<string, number> = { Pending: 0, Upheld: 1, PartiallyUpheld: 2, Overturned: 3 };
