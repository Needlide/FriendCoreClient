/**
 * Post + feed + media contracts. Mirror the API exactly (camelCase) — do not rename.
 */

export type PostSensitivity = 'General' | 'Sensitive' | 'Explicit';

export interface MediaVariant {
  type: string; // Thumbnail | Small | Medium | Large (Original never appears here)
  url: string;
  widthPx: number;
  heightPx: number;
}

export interface PostMedia {
  id: string;
  hasFlashingWarning: boolean;
  hasIntenseMotionWarning: boolean;
  variants: MediaVariant[];
}

export interface PostTag {
  name: string;
  slug: string;
}

export interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  content: string | null;
  sensitivity: string;
  likeCount: number;
  commentCount: number;
  isLikedByCurrentUser: boolean;
  createdAt: string;
  media: PostMedia[];
  tags: PostTag[];
}

/** GET /feed/home?cursor= — cursor opaque, null nextCursor means end. */
export interface PostFeedResponse {
  posts: Post[];
  nextCursor: string | null;
}

/** POST /posts */
export interface CreatePostRequest {
  content?: string | null;
  sensitivity: PostSensitivity;
  mediaIds?: string[];
  tags?: string[];
}

/** POST /media → 201. Only id + status; variants arrive via the post. */
export interface MediaUploadResponse {
  id: string;
  status: string; // Processing
}

/** Comment shapes (GET/POST /posts/{id}/comments). */
export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  content: string;
  createdAt: string;
}

export interface CommentFeedResponse {
  comments: PostComment[];
  nextCursor: string | null;
}

/** Bytes-sent progress emitted by the upload event stream (0–100). */
export interface UploadProgress {
  percent: number;
}

export type MediaStatus = 'Processing' | 'Ready' | 'Failed';

export interface MediaStatusResponse {
  id: string;
  status: string;
}

/** Client mirrors of server limits (fast feedback only — the server gates). */
export const MAX_POST_LENGTH = 5000;
export const MAX_POST_TAGS = 12;
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
