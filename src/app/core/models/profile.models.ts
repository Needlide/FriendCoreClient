/**
 * Profile contracts. Mirror the API exactly (camelCase) — do not rename.
 *
 * Deliberate gaps worth knowing:
 *  - No follower/following/post counts in the profile response. Counts are omitted from
 *    tab labels rather than invented client-side.
 *  - Tags are available separately via GET /users/{username}/tags, but the profile screen
 *    does not display them yet.
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
  /** Whether the requesting user follows this entry — drives the row's follow button. */
  isFollowedByViewer?: boolean;
}

/** GET /users/{username}/followers and .../following */
export interface FollowListResponse {
  users: UserSummary[];
}

/** GET /users/me/blocks and /users/me/mutes */
export interface UserListResponse {
  users: UserSummary[];
}
