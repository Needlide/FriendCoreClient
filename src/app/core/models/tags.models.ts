/**
 * Tag + discovery contracts. Mirror the API exactly (camelCase) — do not rename fields.
 */

/** Tier of a profile tag. Serialized as a string ("Primary" | "Secondary"). */
export type ProfileTagTier = 'Primary' | 'Secondary';

/** One entry of the PUT /users/me/tags body. */
export interface ProfileTagInput {
  name: string;
  tier: ProfileTagTier;
  isPublic: boolean;
}

/** GET /tags/autocomplete?q= */
export interface TagSuggestion {
  id: string;
  name: string;
  slug: string;
  totalCount: number;
}

export interface TagAutocompleteResponse {
  query: string;
  suggestions: TagSuggestion[];
  /** False when nothing matches exactly — the UI offers "be the first to use it". */
  hasExactMatch: boolean;
}

/** GET /feed/discovery/people */
export interface DiscoveryPerson {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  matchScore: number;
}

export interface DiscoveryPeopleResponse {
  people: DiscoveryPerson[];
}

/** GET /users/me/tags — the reader the PUT response shape already had. */
export interface ProfileTagItem {
  tagId: string;
  name: string;
  slug: string;
  tier: string; // "Primary" | "Secondary"
  isPublic: boolean;
}

export interface ProfileTagsResponse {
  tags: ProfileTagItem[];
}

/** Client-side tag limits (mirror the server's TagLimits). */
export const MAX_PRIMARY_TAGS = 6;
export const MAX_SECONDARY_TAGS = 20;
