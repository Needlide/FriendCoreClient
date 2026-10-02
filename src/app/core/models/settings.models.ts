/**
 * Settings + appeals + safety contracts. Mirror the API exactly — do not rename.
 */

/** GET /users/me/preferences (and PATCH …/preferences, which returns the same shape). */
export interface UserPreferences {
  hideFlashingMedia: boolean;
  reduceMotion: boolean;
  disableAutoplay: boolean;
  reduceVisualNoise: boolean;
  contentPreference: 'General' | 'Sensitive' | 'Explicit';
}

export type UpdatePreferencesRequest = UserPreferences;

/** GET /users/me/keyword-filters → { keywords }; PATCH replaces the whole set. */
export interface KeywordFiltersResponse {
  keywords: string[];
}

/** GET /users/me/moderation-actions — no moderator identity or IP is ever exposed. */
export interface ModerationAction {
  id: string;
  action: string;
  reason: string;
  createdAt: string;
}

export interface MyModerationActionsResponse {
  actions: ModerationAction[];
}

/** POST /appeals { auditLogId, reason } → 204. */
export interface SubmitAppealRequest {
  auditLogId: string;
  reason: string;
}

/** Report categories: enum wire values with the user-facing labels beside them. */
export const REPORT_CATEGORIES = [
  { value: 'Spam', label: 'It is spam or fake' },
  { value: 'Harassment', label: 'It is harassment or hateful content' },
  { value: 'NudityOrSexual', label: 'It includes nudity or sexual content' },
  { value: 'ViolenceOrDangerous', label: 'It promotes violence or dangerous activity' },
  { value: 'PrivateInformation', label: 'It includes my private information' },
  { value: 'Copyright', label: 'It violates my copyright' },
  { value: 'InvolvesMinor', label: 'It involves a minor in a concerning way' },
  { value: 'FlashingLights', label: 'Flashing lights / seizure risk' },
  { value: 'Other', label: 'Something else' },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]['value'];

/** Where a report is filed — the dialog takes one of these targets. */
export type ReportTarget =
  { kind: 'post'; id: string } | { kind: 'user'; username: string } | { kind: 'media'; id: string };
