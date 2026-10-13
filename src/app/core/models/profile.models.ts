/**
 * Profile contracts. Mirror the API exactly (camelCase) — do not rename.
 *
 * Deliberate gaps worth knowing (server follow-ups, not client bugs):
 *  - No follower/following/post counts, no follow-state, no tags in the response.
 *    Counts are omitted from tab labels; follow buttons start neutral (follow is
 *    idempotent server-side, so a redundant click self-heals); tags need a future
 *    GET /users/{username}/tags (only PUT exists today).
 */

/** GET /users/{username} */
export interface UserProfile {
  userId: string;
  username: string;
  displayName: string;
  bio: string | null;
  websiteUrl: string | null;
  location: string | null;
  isVerified: boolean;
  /** Whether the requesting user follows this profile — drives the follow button. */
  isFollowedByViewer: boolean;
  createdAt: string;
}

/** PATCH /users/me/profile — all fields optional, only sent ones change. */
export interface UpdateProfileRequest {
  displayName?: string | null;
  bio?: string | null;
  websiteUrl?: string | null;
  location?: string | null;
}

/** Follower/following list entry (subset of the auth Session shape). */
export interface UserSummary {
  userId: string;
  username: string;
  displayName: string;
  isVerified: boolean;
}

/** GET /users/{username}/followers and .../following */
export interface FollowListResponse {
  users: UserSummary[];
}
