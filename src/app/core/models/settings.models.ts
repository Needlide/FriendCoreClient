/**
 * Settings + appeals + safety contracts. Mirror the API exactly — do not rename.
 */

/** GET /users/me/preferences (and PATCH …/preferences, which returns the same shape). */
export interface UserPreferences {
  hideFlashingMedia: boolean;
  /**
   * true → ask before showing media flagged with the arachnophobia hazard. Opt-out, like
   * hideFlashingMedia: turning it off is consent, so the viewer auto-reveals.
   */
  hideArachnidMedia: boolean;
  reduceMotion: boolean;
  disableAutoplay: boolean;
  reduceVisualNoise: boolean;
  contentPreference: 'General' | 'Sensitive' | 'Explicit';
  /**
   * true → Enter sends, Shift+Enter newline. false → Enter newline, Ctrl/Cmd+Enter sends.
   * Defaults to true server-side and in every fallback here, so the composer behaves the way
   * it did before this preference existed while preferences are still loading.
   */
  sendMessageOnEnter: boolean;
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
  // The wire value stays "FlashingLights" — it is persisted as a string in reports.category,
  // so renaming the enum member would orphan every existing row. Only the label moved:
  // this category now also covers intense motion, per §7.4 layer 2 ("Flashing / intense
  // visual content"), which is how a motion report can reach a moderator at all.
  { value: 'FlashingLights', label: 'Flashing lights or intense motion' },
  { value: 'Other', label: 'Something else' },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]['value'];

/**
 * Where a report is filed — the dialog takes one of these targets.
 *
 * A message needs its conversation id alongside the message id: the report route is
 * conversation-scoped, which is what keeps a guessed message id a 404.
 */
export type ReportTarget =
  | { kind: 'post'; id: string }
  | { kind: 'user'; username: string }
  | { kind: 'media'; id: string }
  | { kind: 'message'; conversationId: string; id: string };
